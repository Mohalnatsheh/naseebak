import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parsePagination(searchParams: URLSearchParams, defaultSize = 10) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  return { page, pageSize: defaultSize, skip: (page - 1) * defaultSize };
}
