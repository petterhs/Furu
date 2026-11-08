import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothStatusCodes
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import com.plugin.blec.BleClientPlugin
import org.json.JSONArray
import java.util.Base64
import java.util.UUID


class Peripheral(private val activity: Activity, private val device: BluetoothDevice, private val plugin: BleClientPlugin) {
    private val CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    private val base64Encoder: Base64.Encoder = Base64.getEncoder()

    @Volatile private var connected = false
    private var bonded = false
    @Volatile private var gatt: BluetoothGatt? = null
    private var services: List<BluetoothGattService> = listOf()
    private val characteristics: MutableMap<UUID,BluetoothGattCharacteristic> = mutableMapOf()
    private var onConnectionStateChange: ((connected:Boolean,error:String)->Unit)? = null
    private var onServicesDiscovered: ((connected:Boolean,error:String)->Unit)? = null
    private var notifyChannel:Channel? = null
    private val onReadInvoke:MutableMap<UUID,Invoke> = mutableMapOf()
    private val onWriteInvoke:MutableMap<UUID,Invoke> = mutableMapOf()
    private var onDescriptorInvoke: Invoke? = null
    private var onMtuInvoke: Invoke? = null
    private var currentMtu = 517;
    private val sessionLease = GattSessionLease()

    fun retireSession(id: Long, complete: () -> Unit) {
        callbackHandler.post {
            if (sessionLease.retire(id)) failConnection("Rust retired GATT session $id")
            complete()
        }
    }
    private val callbackHandler = Handler(Looper.getMainLooper())
    private val deadlines = mutableMapOf<String, Runnable>()

    private fun clearDeadline(key: String) {
        synchronized(deadlines) { deadlines.remove(key) }?.let { callbackHandler.removeCallbacks(it) }
    }

    @SuppressLint("MissingPermission")
    private fun armDeadline(key: String, client: BluetoothGatt, milliseconds: Long = 10_000) {
        clearDeadline(key)
        lateinit var job: Runnable
        job = Runnable {
            val expired = synchronized(deadlines) {
                if (deadlines[key] !== job) false else { deadlines.remove(key); true }
            }
            if (expired && isCurrentGatt(client)) {
                Log.w("FuruBleGatt", "GATT timeout: address=${device.address} operation=$key")
                try { client.disconnect() }
                catch (error: RuntimeException) { Log.w("FuruBleGatt", "Cannot disconnect expired client", error) }
                failConnection("GATT timeout: $key")
            }
        }
        synchronized(deadlines) { deadlines[key] = job }
        callbackHandler.postDelayed(job, milliseconds)
    }

    @SuppressLint("MissingPermission")
    private fun failConnection(reason: String) {
        val client = gatt
        gatt = null
        connected = false
        sessionLease.disconnected()
        services = listOf()
        characteristics.clear()
        plugin.connected_devices.remove(device.address, this)
        rejectPending(reason)
        finishConnect(false, reason)
        sendEvent(Event.DeviceDisconnected)
        closeClient(client)
    }

    @SuppressLint("MissingPermission")
    private fun closeClient(client: BluetoothGatt?) {
        try { client?.close() }
        catch (error: RuntimeException) { Log.w("FuruBleGatt", "Cannot close GATT client", error) }
    }

    private fun isCurrentGatt(client: BluetoothGatt?): Boolean = client != null && client === gatt

    private fun finishConnect(success: Boolean, error: String) {
        val pending = onConnectionStateChange.also { onConnectionStateChange = null }
        pending?.invoke(success, error)
    }

    private fun finishServices(success: Boolean, error: String) {
        val pending = onServicesDiscovered.also { onServicesDiscovered = null }
        pending?.invoke(success, error)
    }

    /** Release Rust/mobile IPC waiters before emitting the disconnect event.
     * Otherwise a read can hold the Rust session lock while disconnect waits for it. */
    private fun rejectPending(reason: String) {
        val timers = synchronized(deadlines) { deadlines.values.toList().also { deadlines.clear() } }
        timers.forEach { callbackHandler.removeCallbacks(it) }
        val reads = synchronized(onReadInvoke) { onReadInvoke.values.toList().also { onReadInvoke.clear() } }
        val writes = synchronized(onWriteInvoke) { onWriteInvoke.values.toList().also { onWriteInvoke.clear() } }
        val descriptor = onDescriptorInvoke.also { onDescriptorInvoke = null }
        val mtu = onMtuInvoke.also { onMtuInvoke = null }
        val discovery = onServicesDiscovered.also { onServicesDiscovered = null }
        reads.forEach { it.reject(reason) }
        writes.forEach { it.reject(reason) }
        descriptor?.reject(reason)
        mtu?.reject(reason)
        discovery?.invoke(false, reason)
    }

    private enum class Event{
        DeviceConnected,
        DeviceDisconnected
    }
    private fun sendEvent(event: Event){
        val channel = this.plugin.eventChannel?: return
        val data = JSObject()
        if (event == Event.DeviceConnected){
            data.put("DeviceConnected",this.device.address)
        } else if (event == Event.DeviceDisconnected){
            data.put("DeviceDisconnected",this.device.address)
        }
        println("sending event $data")
        channel.send(data)
    }

    private val callback = object:BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
            Log.i("FuruBleGatt", "state address=${device.address} status=$status newState=$newState")
            if (!isCurrentGatt(gatt)) {
                Log.w("FuruBleGatt", "ignoring callback from superseded GATT client")
                closeClient(gatt)
                return
            }
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothGatt.STATE_CONNECTED && gatt != null) {
                clearDeadline("connect")
                // gatt.requestMtu(517)
                this@Peripheral.connected = true
                this@Peripheral.gatt = gatt
                finishConnect(true, "")
                this@Peripheral.sendEvent(Event.DeviceConnected)

            } else {
                failConnection("GATT disconnected: status=$status state=$newState")
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (!isCurrentGatt(gatt)) return
            clearDeadline("services")
            println("onServicesDiscovered status $status, services ${gatt.services}")

            if (status != BluetoothGatt.GATT_SUCCESS) {
                this@Peripheral.services = listOf()
                finishServices(
                    false,
                    "No services discovered. Status $status"
                )
            } else {
                this@Peripheral.services = gatt.services
                for (s in gatt.services) {
                    for (c in s.characteristics) {
                        this@Peripheral.characteristics[c.uuid] = c
                    }
                }
                finishServices(true, "")
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            if (!isCurrentGatt(gatt)) return
            this@Peripheral.notifyChannel?.let {
                synchronized(it) {
                    val notification = JSObject();
                    notification.put("uuid", characteristic.uuid)
                    notification.put("data", base64Encoder.encodeToString(value))
                    it.send(notification)
                }
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?,
            status: Int
        ) {
            if (!isCurrentGatt(gatt)) return
            val id = characteristic?.uuid ?: return
            clearDeadline("write:$id")
            synchronized(this@Peripheral.onWriteInvoke) {
                val invoke = this@Peripheral.onWriteInvoke[id]
                if (invoke == null) {
                    Log.e("Peripheral", "Did not find tauri invoke obj for write on $id")
                } else {
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        invoke.reject("Write to characteristic $id failed with status $status")
                    } else {
                        invoke.resolve()
                    }
                }
                this@Peripheral.onWriteInvoke.remove(id)
            }
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            @Suppress("DEPRECATION")
            val value = characteristic.value ?: byteArrayOf()
            onCharacteristicRead(gatt, characteristic, value, status)
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            val value = characteristic.value ?: byteArrayOf()
            onCharacteristicChanged(gatt, characteristic, value)
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            if (!isCurrentGatt(gatt)) return
            val id = characteristic.uuid ?: return
            clearDeadline("read:$id")
            synchronized(this@Peripheral.onReadInvoke) {
                val invoke = this@Peripheral.onReadInvoke[id]
                if (invoke == null) {
                    Log.e("Peripheral", "Did not find tauri invoke obj for read on $id")
                } else {
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        invoke.reject("Read from characteristic $id failed with status $status")
                    } else {
                        val res = JSObject()
                        res.put("value", base64Encoder.encodeToString(value))
                        invoke.resolve(res)
                    }
                }
                this@Peripheral.onReadInvoke.remove(id)
            }
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt?,
            descriptor: BluetoothGattDescriptor?,
            status: Int
        ) {
            if (!isCurrentGatt(gatt)) return
            clearDeadline("descriptor")
            val pending = this@Peripheral.onDescriptorInvoke.also { this@Peripheral.onDescriptorInvoke = null }
            if (status != BluetoothGatt.GATT_SUCCESS) {
                pending?.reject("descriptor write failed with status: $status")
            } else if (descriptor?.uuid != CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR) {
                pending?.reject("unexpected write to descriptor: ${descriptor?.uuid}")
            } else {
                pending?.resolve()
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt?, mtu: Int, status: Int) {
            if (!isCurrentGatt(gatt)) return
            clearDeadline("mtu")
            val pending = this@Peripheral.onMtuInvoke.also { this@Peripheral.onMtuInvoke = null }
            println("MTU changed to $mtu with status $status")
            currentMtu = mtu
            if (status != BluetoothGatt.GATT_SUCCESS) {
                pending?.reject("mtu change failed: $status")
                return
            }
            val res = JSObject()
            res.put("mtu",mtu)
            pending?.resolve(res)

        }
    }

    @SuppressLint("MissingPermission")
    fun connect(invoke:Invoke, sessionId: Long) {
        callbackHandler.post { connectOnHandler(invoke, sessionId) }
    }

    @SuppressLint("MissingPermission")
    private fun connectOnHandler(invoke: Invoke, sessionId: Long) {
        if (!sessionLease.accept(sessionId)) {
            invoke.reject("GATT session $sessionId was superseded or retired")
            return
        }
        println("connect android implementation called")
        val previous = this.gatt
        this.gatt = null
        closeClient(previous)
        rejectPending("GATT connection replaced")
        finishConnect(false, "GATT connection replaced")
        this.connected = false
        this.services = listOf()
        this.characteristics.clear()
        this.onConnectionStateChange = { success, error ->
            if(success){
                invoke.resolve()
            } else {
                invoke.reject(error)
            }
        }
        // Dispatch callbacks on the same looper, after the GATT owner is assigned.
        try {
            this.gatt = this.device.connectGatt(activity, false, this.callback,
                BluetoothDevice.TRANSPORT_LE, BluetoothDevice.PHY_LE_1M_MASK, callbackHandler)
            if (this.gatt == null) finishConnect(false, "connectGatt returned null")
            this.gatt?.let { armDeadline("connect", it, 5_000) }
        } catch (error: RuntimeException) {
            finishConnect(false, "connectGatt failed: ${error.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun discoverServices(invoke:Invoke){
        val gatt = this.gatt
        if (gatt == null){
            invoke.reject("No gatt server connected")
            return
        }
        if (onServicesDiscovered != null) {
            invoke.reject("Previous service discovery is still pending")
            return
        }
        this.onServicesDiscovered={ success, error ->
            if (success) {
                invoke.resolve()
            } else {
                invoke.reject(error)
            }
        }
        armDeadline("services", gatt)

        Handler(Looper.getMainLooper()).post(Runnable {
            if (!gatt.discoverServices()) {
                clearDeadline("services")
                this.onServicesDiscovered = null
                invoke.reject("failed to start service discovery");
            }
            println("service discovery started")
        })
    }

    fun isConnected():Boolean {
        return this.connected
    }

    fun isBonded(): Boolean {
        return this.device.bondState == BluetoothDevice.BOND_BONDED
    }

    @SuppressLint("MissingPermission")
    fun disconnect(invoke: Invoke){
        this.gatt?.disconnect()
        this.connected = false
        invoke.resolve()
    }

     class ResCharacteristic (
         private val uuid: String,
         private val properties: Int,
         private val descriptors: List<String>
     ){
         fun toJson():JSObject{
             val ret = JSObject()
             ret.put("uuid",uuid)
             ret.put("properties",properties)
             val descriptors = JSONArray()
             for (desc in this.descriptors){
                 descriptors.put(desc)
             }
             ret.put("descriptors",descriptors)
            return ret
         }
     }

    class ResService (
        private val uuid: String,
        private val primary: Boolean,
        private val characs: List<ResCharacteristic>,
    ){
        fun toJson():JSObject{
            val ret = JSObject()
            ret.put("uuid",uuid)
            ret.put("primary",primary)
            val characs = JSONArray()
            for (char in this.characs){
                characs.put(char.toJson())
            }
            ret.put("characs",characs)
            return ret
        }
    }

    fun services(invoke:Invoke){
        val services = JSONArray()
        for(service in this.services){
            val characs:MutableList<ResCharacteristic> = mutableListOf()
            for (charac in service.characteristics){
                characs.add(ResCharacteristic(
                    charac.uuid.toString(),
                    0,
                    charac.descriptors.map { desc ->  desc.uuid.toString()},
                ))
            }
            services.put(ResService(
                service.uuid.toString(),
                service.type == BluetoothGattService.SERVICE_TYPE_PRIMARY,
                characs
            ).toJson())
        }
        val res = JSObject()
        res.put("result",services)
        invoke.resolve(res)
    }

    fun setNotifyChannel(channel: Channel){
        this.notifyChannel = channel;
    }

    @SuppressLint("MissingPermission")
    fun write(invoke: Invoke){
        val args = invoke.parseArgs(BleClientPlugin.WriteParams::class.java)
        val gatt = this.gatt;
        if (gatt == null){
            invoke.reject("No gatt server connected")
            return
        }
        val charac = this.characteristics[args.characteristic!!]
        if (charac == null){
            invoke.reject("Characterisitc ${args.characteristic} not found")
            return
        }
        synchronized(this.onWriteInvoke) {
            if (this.onWriteInvoke[args.characteristic] != null) {
                invoke.reject("Previous write is still pending")
                return
            }
            this.onWriteInvoke[args.characteristic] = invoke
        }
        armDeadline("write:${args.characteristic}", gatt)
        val accepted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeCharacteristic(charac,args.data!!,if (args.withResponse){BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT}else{BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE}) == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            charac.value = args.data
            charac.writeType = if (args.withResponse) BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT else BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            @Suppress("DEPRECATION")
            gatt.writeCharacteristic(charac)
        }
        if (!accepted) {
            clearDeadline("write:${args.characteristic}")
            synchronized(onWriteInvoke) { onWriteInvoke.remove(args.characteristic) }
            invoke.reject("Android refused to start characteristic write")
        }
    }

    @SuppressLint("MissingPermission")
    fun read(invoke: Invoke){
        val args = invoke.parseArgs(BleClientPlugin.ReadParams::class.java)
        val gatt = this.gatt;
        if (gatt == null){
            invoke.reject("No gatt server connected")
            return
        }
        val charac = this.characteristics[args.characteristic!!]
        if (charac == null){
            invoke.reject("Characteristic ${args.characteristic} not found")
            return
        }
        synchronized(this.onReadInvoke) {
            if (this.onReadInvoke[args.characteristic] != null) {
                invoke.reject("Previous read is still pending")
                return
            }
            this.onReadInvoke[args.characteristic] = invoke
        }
        armDeadline("read:${args.characteristic}", gatt)
        if (!gatt.readCharacteristic(charac)) {
            clearDeadline("read:${args.characteristic}")
            synchronized(onReadInvoke) { onReadInvoke.remove(args.characteristic) }
            invoke.reject("Android refused to start characteristic read")
        }
    }

    @SuppressLint("MissingPermission")
    fun subscribe(invoke: Invoke,enabled: Boolean){
        val args = invoke.parseArgs(BleClientPlugin.ReadParams::class.java)
        val gatt = this.gatt;
        if (gatt == null){
            invoke.reject("No gatt server connected")
            return
        }
        val charac = this.characteristics[args.characteristic!!]
        if (charac == null){
            invoke.reject("Characteristic ${args.characteristic} not found")
            return
        }

        if (onDescriptorInvoke != null) {
            invoke.reject("Previous descriptor write is still pending")
            return
        }
        val descriptor = charac.getDescriptor(CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR)
        if (descriptor == null) {
            invoke.reject("Notification descriptor not found")
            return
        }
        if (!gatt.setCharacteristicNotification(charac,enabled)){
            invoke.reject("Failed to set notification status")
            return
        }
        this.onDescriptorInvoke = invoke
        armDeadline("descriptor", gatt)
        val data = if (enabled){BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE}else{BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE}
        val accepted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeDescriptor(descriptor,data) == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            descriptor.value = data
            @Suppress("DEPRECATION")
            gatt.writeDescriptor(descriptor)
        }
        if (!accepted) {
            clearDeadline("descriptor")
            onDescriptorInvoke = null
            invoke.reject("Android refused to start descriptor write")
        }
    }

    @SuppressLint("MissingPermission")
    fun requestMtu(invoke: Invoke, mtu: Int){
        val gatt = this.gatt
        if (gatt == null) {
            invoke.reject("No gatt server connected")
            return
        }
        if (onMtuInvoke != null) {
            invoke.reject("Previous MTU request is still pending")
            return
        }
        onMtuInvoke = invoke
        armDeadline("mtu", gatt)
        Handler(Looper.getMainLooper()).post(Runnable {
            if (!gatt.requestMtu(mtu)) {
                clearDeadline("mtu")
                onMtuInvoke = null
                invoke.reject("Failed to request mtu")
            }
        })
    }
}
