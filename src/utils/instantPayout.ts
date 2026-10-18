/**
 * What a provider is told before and after an instant payout. Every figure is
 * Stripe's (gross = leaves their Stripe balance, net = reaches them), so the
 * fee shown is exactly the fee charged, whatever the Platform Pricing Tool is
 * set to. Stripe requires the fee to be shown clearly before they confirm.
 */
export interface InstantPayoutFigures {
  label: string;
  currency: string;
  grossPence: number;
  netPence: number;
}

const money = (pence: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);

export function instantPayoutFeePence(figures: InstantPayoutFigures): number {
  return figures.grossPence - figures.netPence;
}

/** The button: "Pay out £98.50 now". */
export function instantPayoutButtonLabel(figures: InstantPayoutFigures): string {
  return `Pay out ${money(figures.netPence, figures.currency)} now`;
}

/** The line under the button, so the fee is visible before anything is tapped. */
export function instantPayoutFeeLine(figures: InstantPayoutFigures): string {
  return `Instant fee ${money(instantPayoutFeePence(figures), figures.currency)}. Available 24/7, including weekends and holidays; it typically reaches your account within 30 minutes. Otherwise your money goes out on your usual payout schedule.`;
}

export function instantPayoutConfirmation(figures: InstantPayoutFigures): { title: string; body: string } {
  const { currency } = figures;
  return {
    title: 'Pay out instantly?',
    body: `From your Stripe balance: ${money(figures.grossPence, currency)}\n`
      + `Instant fee: ${money(instantPayoutFeePence(figures), currency)}\n`
      + `To ${figures.label}: ${money(figures.netPence, currency)}\n\n`
      + 'It typically reaches your account within 30 minutes, but some banks take longer.',
  };
}
