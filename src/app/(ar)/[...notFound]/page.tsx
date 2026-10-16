import { notFound } from "next/navigation";

// Unknown addresses render the branded Arabic 404 in (ar)/not-found.tsx
export default function CatchAllNotFound() {
  notFound();
}
