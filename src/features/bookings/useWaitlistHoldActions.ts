import { useCallback } from 'react';
import { useCart } from '../../contexts/CartContext';
import {
  declineWaitlistHold,
  getBookingById,
  getRebookableService,
  type MyWaitlistPlace,
} from '../../services/databaseService';
import type { DialogButton } from '../../components/AppDialog';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { buildWaitlistHoldCartItem, offeredSlotLabel } from './waitlist';

interface WaitlistHoldActionsArgs {
  showAlert: (title: string, message?: string) => void;
  showConfirm: (title: string, message: string | undefined, buttons: DialogButton[]) => void;
  /** Marks the place as busy (or null when done), for the buttons' spinners. */
  setBusyId: (id: string | null) => void;
  /** Opens the Cart from wherever the ticket is. */
  openCart: () => void;
  /** Reload the client's waitlist places after a hold changes. */
  reload: () => Promise<unknown>;
  /** Names the screen in logs. */
  context: string;
}

/**
 * What a client can do with a held waitlist slot, from either place its
 * ticket opens (Bookings, or the provider's page from the "slot opened"
 * notification): Confirm & pay puts the slot in the Cart at its fixed time,
 * carrying the hold so prepare_checkout reuses that row, and opens the Cart;
 * Pass it on asks first, then gives the slot up.
 */
export function useWaitlistHoldActions({ showAlert, showConfirm, setBusyId, openCart, reload, context }: WaitlistHoldActionsArgs) {
  const { addToCart, items: cartItems, removeFromCart } = useCart();

  const removeHoldFromCart = useCallback((holdBookingId: string | null) => {
    if (!holdBookingId) return;
    cartItems
      .filter(item => item.waitlistHold?.bookingId === holdBookingId)
      .forEach(item => removeFromCart(item.id));
  }, [cartItems, removeFromCart]);

  const confirmAndPay = useCallback(async (place: MyWaitlistPlace) => {
    if (!place.holdBookingId) return;
    setBusyId(place.id);
    try {
      const hold = await getBookingById(place.holdBookingId);
      if (!hold || hold.status !== 'on_hold' || !hold.hold_expires_at) {
        showAlert('This slot has gone', "Its time ran out before you could pay, so you've come off this waitlist. You can rejoin.");
        await reload();
        return;
      }
      const live = await getRebookableService(hold.provider_id, hold.service_name_snapshot);
      if (!live || live.id !== hold.service_id) {
        showAlert("Can't book this right now", `${place.providerName} isn't taking bookings for ${place.serviceName} at the moment.`);
        return;
      }
      addToCart(buildWaitlistHoldCartItem({
        holdBookingId: hold.id,
        holdExpiresAt: hold.hold_expires_at,
        bookingDate: hold.booking_date,
        bookingTime: hold.booking_time,
        providerId: hold.provider_id,
        providerImage: hold.provider_logo_snapshot,
        live,
      }));
      openCart();
    } catch (error) {
      showAlert("Couldn't open checkout", toUserMessageAllowingDbGuard(error, 'Check your connection and try again.', `${context}.confirmAndPayWaitlist`));
    } finally {
      setBusyId(null);
    }
  }, [addToCart, context, openCart, reload, setBusyId, showAlert]);

  const passOnHold = useCallback((place: MyWaitlistPlace) => {
    const holdId = place.holdBookingId;
    if (!holdId) return;
    const slot = offeredSlotLabel(place.offeredDate, place.offeredTime) ?? 'this slot';
    showConfirm(
      `Pass on ${slot}?`,
      "It'll be offered to someone else, and you'll come off this waitlist. You can rejoin afterwards.",
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Pass it on',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(place.id);
              try {
                await declineWaitlistHold(holdId);
                removeHoldFromCart(holdId);
                await reload();
              } catch (error) {
                showAlert("Couldn't pass it on", toUserMessageAllowingDbGuard(error, 'Check your connection and try again.', `${context}.passWaitlist`));
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
  }, [context, reload, removeHoldFromCart, setBusyId, showAlert, showConfirm]);

  return { confirmAndPay, passOnHold, removeHoldFromCart };
}
