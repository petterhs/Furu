import org.junit.Assert.*
import org.junit.Test

class GattSessionLeaseTest {
    @Test fun lateRetirementCannotCloseANewerClient() {
        val lease = GattSessionLease()
        assertTrue(lease.accept(1))
        assertTrue(lease.accept(2))
        assertFalse(lease.retire(1))
        assertTrue(lease.retire(2))
        assertFalse(lease.retire(2))
    }

    @Test fun RetirementBeforeDispatchPreventsAnAbandonedConnectFromResurrecting() {
        val lease = GattSessionLease()
        assertFalse(lease.retire(2))
        assertFalse(lease.accept(1))
        assertFalse(lease.accept(2))
        assertTrue(lease.accept(3))
    }

    @Test fun DisconnectRequiresAFreshAttemptId() {
        val lease = GattSessionLease()
        assertTrue(lease.accept(7))
        lease.disconnected()
        assertFalse(lease.retire(7))
        assertFalse(lease.accept(7))
        assertTrue(lease.accept(8))
    }

    @Test fun AbandonedNewAttemptRetiresTheOlderClientBeforeDispatch() {
        val lease = GattSessionLease()
        assertTrue(lease.accept(3))
        assertTrue(lease.retire(4))
        assertFalse(lease.accept(4))
        assertTrue(lease.accept(5))
        assertFalse(lease.retire(4))
    }
}
