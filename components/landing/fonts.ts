import { Caveat, Instrument_Serif } from "next/font/google"

// Display serif for headlines; handwriting for red-pen notes.
export const displayFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display-serif",
})

export const handFont = Caveat({
  subsets: ["latin"],
  variable: "--font-handwriting",
})
