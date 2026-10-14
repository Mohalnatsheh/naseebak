"use client";

import { useEffect, useState } from "react";

export default function TrackingScripts() {
  const [gtmId, setGtmId] = useState("");
  const [fbPixelId, setFbPixelId] = useState("");

  useEffect(() => {
    fetch("/api/settings/tracking")
      .then((res) => res.json())
      .then((data) => {
        if (data.gtmId) setGtmId(data.gtmId);
        if (data.fbPixelId) setFbPixelId(data.fbPixelId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!gtmId) return;

    // GTM inline script
    const script = document.createElement("script");
    script.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`;
    document.head.appendChild(script);

    // GTM noscript iframe
    const noscript = document.createElement("noscript");
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);

    return () => {
      script.remove();
      noscript.remove();
    };
  }, [gtmId]);

  useEffect(() => {
    if (!fbPixelId) return;

    const script = document.createElement("script");
    script.innerHTML = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${fbPixelId}');
fbq('track', 'PageView');`;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [fbPixelId]);

  return null;
}
