# 🔍 DEBUGGING GUIDE - Reschedule System

## 📋 What to Check in Console Logs

### **When you reschedule a booking, you should see:**

#### **Step 1: User Requests Reschedule**
```
📤 [Provider Name] Step 1: User requesting reschedule for booking booking_xxxxx
✅ [Provider Name] Step 1 Complete: Booking booking_xxxxx Status=PENDING
⏱️ [Provider Name] Timeout registered for booking booking_xxxxx
```

#### **Step 2: Provider Responds (After 30 seconds)**
```
⏰ [Provider Name] Step 2: 30s elapsed for booking booking_xxxxx, provider responding...
📋 [Provider Name] Before update: { isPending: true, hasDates: false, datesCount: 0 }
📋 [Provider Name] After update: { isPending: true, hasDates: true, datesCount: X }
✅ [Provider Name] Step 2 Complete: Booking booking_xxxxx Status=AVAILABLE
🧹 [Provider Name] Timeout cleaned up for booking booking_xxxxx
```

#### **Step 3: Modal Updates (useEffect)**
```
🔄 [Provider Name] Booking booking_xxxxx state update: {
  from: 'PENDING',
  to: 'AVAILABLE',
  dates: '0 → X',
  hasDatesObject: true,
  signature: { old: 'id|true|0|date|time', new: 'id|true|X|date|time' }
}
```

---

## 🚫 **Common Issues & Solutions**

### **Issue 1: Booking Stays in PENDING**

**Symptoms:**
- Badge shows "PENDING" even after 30 seconds
- No "Step 2" logs appear
- Timeout doesn't fire

**Possible Causes:**
1. ✅ **Timeout was cleared prematurely**
   - Check for: `🧹 Clearing previous timeout` BEFORE 30 seconds
   - Solution: Don't close modal or cancel booking during 30s wait

2. ✅ **Error in timeout execution**
   - Check for: `❌ [Provider Name] Error for booking`
   - Check error message in logs

3. ✅ **generateDynamicRescheduleDates returned empty array**
   - Check for: `datesCount: 0` in "After update" log
   - Solution: Check date generation logic

---

### **Issue 2: "AVAILABLE" Shows But No "Reschedule Now" Button**

**Symptoms:**
- Badge shows "AVAILABLE"
- Modal still shows "Waiting for provider..."
- No button to select dates

**Root Cause:**
- `selectedBooking` in modal doesn't have updated `providerAvailableDates`
- `useEffect` didn't trigger or update failed

**Check Console For:**
```
🔄 [Provider Name] Booking booking_xxxxx state update: {
  ...
  hasDatesObject: false  // ❌ Should be true!
}
```

**If missing:**
1. Modal closed during update
2. `useEffect` dependency issue
3. State signature didn't change

---

### **Issue 3: Multiple Bookings Interfering**

**Symptoms:**
- Booking A shows dates from Booking B
- Wrong provider name in modal
- State flickering

**Check Console For:**
```
// ❌ BAD: Signature changes for wrong booking
🔄 [Her Brows] Booking booking_A state update...
🔄 [Kikis Nails] Booking booking_A state update...  // Wrong!
```

**Solution:**
- Each booking should only log its own updates
- Check that booking IDs match in all logs

---

## 🧪 **Test Procedure for "Her Brows" & "Kikis Nails"**

### **Test 1: Single Booking**
```
1. Open "Her Brows" booking
2. Click "Reschedule"
3. Select dates
4. Click "Confirm Reschedule"
5. ✅ Check console for complete flow (Step 1 → 2 → 3)
6. Wait 30 seconds
7. ✅ Verify badge changes: PENDING → AVAILABLE
8. ✅ Verify button appears: "Reschedule Now"
9. Open modal
10. ✅ Verify dates are shown
```

### **Test 2: Multiple Bookings (Simultaneous)**
```
1. Open "Her Brows" → Reschedule → PENDING
2. Open "Kikis Nails" → Reschedule → PENDING
3. ✅ Check console shows TWO separate timeout registrations
4. Wait 30 seconds
5. ✅ Both should show AVAILABLE independently
6. Open "Her Brows" modal
   - ✅ Should show "Her Brows" dates only
7. Open "Kikis Nails" modal
   - ✅ Should show "Kikis Nails" dates only
```

### **Test 3: One at a Time**
```
1. Reschedule "Her Brows" → Wait 30s → Confirm
2. After 24 hours: Reschedule again
3. ✅ Should allow second reschedule
4. Repeat for "Kikis Nails"
```

---

## 🔧 **Diagnostic Commands**

### **Check Timeout Registry:**
Add this to console after requesting reschedule:
```javascript
// Should show active timeout for each booking
console.log('Active timeouts:', rescheduleTimeoutsRef.current.size);
```

### **Check Booking State:**
After 30 seconds, check:
```javascript
const booking = upcomingBookings.find(b => b.providerName === 'Her Brows');
console.log('Her Brows state:', {
  isPending: booking.isPendingReschedule,
  hasDates: !!booking.rescheduleRequest?.providerAvailableDates,
  datesCount: booking.rescheduleRequest?.providerAvailableDates?.length
});
```

---

## 📊 **Expected Console Output (Full Flow)**

```
// User reschedules "Her Brows"
📤 [Hair by Jennifer] Step 1: User requesting reschedule for booking booking_123
✅ [Hair by Jennifer] Step 1 Complete: Booking booking_123 Status=PENDING
⏱️ [Hair by Jennifer] Timeout registered for booking booking_123

// After 30 seconds
⏰ [Hair by Jennifer] Step 2: 30s elapsed for booking booking_123, provider responding...
📋 [Hair by Jennifer] Before update: { isPending: true, hasDates: false, datesCount: 0 }
📋 [Hair by Jennifer] After update: { isPending: true, hasDates: true, datesCount: 15 }
💾 Saving 5 bookings...
✅ Bookings saved successfully
✅ [Hair by Jennifer] Step 2 Complete: Booking booking_123 Status=AVAILABLE
🧹 [Hair by Jennifer] Timeout cleaned up for booking booking_123

// Modal updates (if open)
🔄 [Hair by Jennifer] Booking booking_123 state update: {
  from: 'PENDING',
  to: 'AVAILABLE',
  dates: '0 → 15',
  hasDatesObject: true,
  signature: {
    old: 'booking_123|true|0|2026-01-20|10:00 AM',
    new: 'booking_123|true|15|2026-01-20|10:00 AM'
  }
}
```

---

## ✅ **Verification Checklist**

After implementing fixes, verify:

- [ ] Step 1 logs appear immediately after clicking "Confirm Reschedule"
- [ ] Timeout is registered (look for ⏱️ emoji)
- [ ] After 30s, Step 2 logs appear
- [ ] "Before update" shows `hasDates: false`
- [ ] "After update" shows `hasDates: true, datesCount: > 0`
- [ ] Bookings are saved to storage
- [ ] If modal is open, useEffect triggers (🔄 log appears)
- [ ] Modal shows "Reschedule Now" button
- [ ] Clicking button shows available dates
- [ ] Multiple bookings don't interfere with each other

---

## 🐛 **Known Issues Fixed**

1. ✅ Infinite re-render loop (useRef fixes this)
2. ✅ Shared state interference (closure capture fixes this)
3. ✅ Race conditions (removed reloadBookings)
4. ✅ All bookings re-rendering (reference preservation)

**If you still see issues with specific providers, share the console logs and I can pinpoint the exact problem!**
