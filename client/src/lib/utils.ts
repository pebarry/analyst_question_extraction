import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function validateStockSymbol(symbol: string): boolean {
  return /^[A-Z]{1,5}$/.test(symbol.toUpperCase());
}

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function getAvailableYears(): number[] {
  const currentYear = getCurrentYear();
  const years = [];
  for (let year = currentYear; year >= currentYear - 10; year--) {
    years.push(year);
  }
  return years;
}
