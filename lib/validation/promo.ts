import { z } from "zod";

// createPromo's numeric inputs. z.number() rejects NaN, so a blank-ish field
// parsed with parseFloat can't reach the row.
export const promoNumbersSchema = z.object({
  msrp: z.number("MSRP must be a number").nonnegative("MSRP can't be negative").nullable(),
  discountPercent: z.number("Discount must be a number").min(0, "Discount must be 0–100%").max(100, "Discount must be 0–100%").nullable(),
  discountPrice: z.number("Discount price must be a number").nonnegative("Discount price can't be negative").nullable(),
  sizeOneQty: z.number("Quantity must be a number").int("Quantity must be a whole number").nonnegative("Quantity can't be negative"),
  sizeTwoQty: z.number("Quantity must be a number").int("Quantity must be a whole number").nonnegative("Quantity can't be negative"),
});

// importPromos' promo period: day-precision TEXT columns (yyyy-MM-dd), so the
// string comparison orders them correctly.
export const promoPeriodSchema = z
  .object({
    promoStart: z.iso.date("Invalid promo start date").nullable(),
    promoEnd: z.iso.date("Invalid promo end date").nullable(),
  })
  .refine((p) => !p.promoStart || !p.promoEnd || p.promoStart <= p.promoEnd, {
    message: "Promo start must be on or before promo end",
  });
