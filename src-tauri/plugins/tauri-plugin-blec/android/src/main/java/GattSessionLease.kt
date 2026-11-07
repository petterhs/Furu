/** Monotonic Rust attempt IDs prevent late timeout cleanup from closing a new client. */
class GattSessionLease {
    private var newest = 0L
    private var active = false

    @Synchronized fun accept(id: Long): Boolean {
        if (id <= newest) return false
        newest = id
        active = true
        return true
    }

    @Synchronized fun retire(id: Long): Boolean {
        if (id < newest) return false
        val close = active
        newest = id
        active = false
        return close
    }

    @Synchronized fun disconnected() { active = false }
}
