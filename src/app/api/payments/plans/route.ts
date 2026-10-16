import { NextResponse } from "next/server";

const packages = [
  {
    id: "credits_3",
    name: "3 أرصدة",
    credits: 3,
    price: 3,
    currency: "JOD",
  },
  {
    id: "credits_5",
    name: "5 أرصدة",
    credits: 5,
    price: 4,
    currency: "JOD",
    popular: true,
  },
  {
    id: "credits_10",
    name: "10 أرصدة",
    credits: 10,
    price: 7,
    currency: "JOD",
  },
];

export async function GET() {
  return NextResponse.json({ packages });
}
