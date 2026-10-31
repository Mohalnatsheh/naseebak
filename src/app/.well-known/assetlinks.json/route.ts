import { NextResponse } from "next/server";
import { ANDROID_PACKAGE, androidCertFingerprints } from "@/lib/mobile-config";

/**
 * Android App Links: lets the app open naseebak.com member pages and referral links. The signing certificate
 * fingerprints come from Admin → Settings → «Mobile app» (Play Console → App integrity); none = no verified links.
 */
export async function GET() {
  const fingerprints = await androidCertFingerprints();
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
