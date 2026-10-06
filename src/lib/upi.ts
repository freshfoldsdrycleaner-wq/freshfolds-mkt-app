/** Fresh Folds' own UPI account. The 20% advance is paid here so the commission is always collected first. */
export const FF_UPI_ID = "shivanikhareedi@okaxis";
export const FF_UPI_NAME = "Fresh Folds";
export const FF_ADVANCE_PREFIX = "FFUPI-";

export function upiLink(amount: number, note: string) {
  return (
    "upi://pay?pa=" +
    encodeURIComponent(FF_UPI_ID) +
    "&pn=" +
    encodeURIComponent(FF_UPI_NAME) +
    "&am=" +
    amount.toFixed(2) +
    "&cu=INR&tn=" +
    encodeURIComponent(note)
  );
}
