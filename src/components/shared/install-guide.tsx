"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BellOff,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Lock,
  Menu,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Settings,
  Share,
  SquarePlus,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { V } from "@/components/shared/gendered-word";
import { requestPushPermission } from "@/lib/push-client";
import { pushPermission, type Device, type PushPermission } from "@/lib/install-env";
import { canPromptInstall, onInstallPromptChange, promptInstall } from "@/lib/install-prompt";

/** Where the full guide lives; copied for people who must reopen the site in a real browser. */
export const INSTALL_GUIDE_URL = "https://naseebak.com/dashboard/install";

const IN_APP_NAME: Record<NonNullable<Device["inApp"]>, string> = {
  instagram: "إنستغرام",
  facebook: "فيسبوك",
  tiktok: "تيك توك",
  snapchat: "سناب شات",
  other: "تطبيق آخر",
};

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-2.5 text-sm">{children}</ol>;
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary ring-1 ring-border [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1 pt-1.5 leading-relaxed">{children}</span>
    </li>
  );
}

const B = ({ children }: { children: ReactNode }) => <span className="font-semibold text-foreground">{children}</span>;

const openIconStep = <Step icon={<BellRing />}><V m="افتح" f="افتحي" /> نصيبك من <B>الأيقونة الجديدة</B> على شاشتك، ثم <V m="وافق" f="وافقي" /> على الإشعارات</Step>;

/** Copies the guide link, for pasting into Safari / Chrome. */
export function CopyLink({ label = "نسخ رابط الموقع" }: { label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL_GUIDE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (some in-app browsers): the link is shown under the button
    }
  }
  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-1.5">
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        {copied ? "تم النسخ" : label}
      </Button>
      <p dir="ltr" className="select-all text-start text-xs text-muted-foreground">{INSTALL_GUIDE_URL}</p>
    </div>
  );
}

/** One-tap install (Android Chrome, Edge, desktop Chromium) when the browser offers it. */
function useInstallPrompt() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const update = () => setAvailable(canPromptInstall());
    update();
    return onInstallPromptChange(update);
  }, []);
  return available;
}

/**
 * Install steps for one device. In another app's browser (Instagram, Facebook…) it first explains
 * how to reopen the site in Safari / Chrome, since nothing can be installed from there.
 */
export function InstallSteps({ device, onInstalled }: { device: Device; onInstalled?: () => void }) {
  const canInstall = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  if (device.standalone) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-green-700">
        <CheckCircle2 className="h-5 w-5" /> نصيبك مثبّت على جهازك وتستخدمه الآن من الأيقونة.
      </p>
    );
  }

  if (device.inApp) {
    const name = IN_APP_NAME[device.inApp];
    const target = device.os === "ios" ? "Safari" : "Chrome";
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <V m="أنت تتصفح" f="أنتِ تتصفحين" /> نصيبك من داخل <B>{name}</B>، ولا يمكن تثبيته أو استقبال الإشعارات من هنا. <V m="افتحه" f="افتحيه" /> في {target} أولاً:
        </p>
        <Steps>
          <Step icon={device.os === "ios" ? <MoreHorizontal /> : <MoreVertical />}>
            <V m="اضغط" f="اضغطي" /> زر <B>النقاط الثلاث</B> في أعلى الشاشة
          </Step>
          <Step icon={<ExternalLink />}>
            <V m="اختر" f="اختاري" /> <B>«فتح في المتصفح»</B> أو <B>«Open in {device.os === "ios" ? "external browser" : "Chrome"}»</B>
          </Step>
          <Step icon={<SquarePlus />}>ثم اتبع خطوات التثبيت التي ستظهر لك هناك</Step>
        </Steps>
        <p className="text-xs text-muted-foreground">إن لم <V m="تجد" f="تجدي" /> الخيار، <V m="انسخ" f="انسخي" /> الرابط <V m="والصقه" f="والصقيه" /> في {target}:</p>
        <CopyLink />
      </div>
    );
  }

  if (canInstall) {
    async function install() {
      setInstalling(true);
      try {
        if (await promptInstall()) {
          onInstalled?.();
          if (pushPermission() === "default") await requestPushPermission().catch(() => {});
        }
      } finally {
        setInstalling(false);
      }
    }
    return (
      <Button onClick={install} disabled={installing} className="gap-1.5">
        <Download className="h-4 w-4" />
        تثبيت التطبيق
      </Button>
    );
  }

  if (device.os === "ios") {
    if (device.browser === "safari") {
      return (
        <Steps>
          <Step icon={<Share />}>
            <V m="اضغط" f="اضغطي" /> زر <B>المشاركة</B> (مربع وسهم للأعلى) أسفل الشاشة. في الإصدارات الأحدث <V m="تجده" f="تجديه" /> داخل زر <B>«⋯»</B>
          </Step>
          <Step icon={<SquarePlus />}>
            <V m="مرّر" f="مرّري" /> للأسفل <V m="واختر" f="واختاري" /> <B>«إضافة إلى الشاشة الرئيسية»</B>
          </Step>
          <Step icon={<Plus />}><V m="اضغط" f="اضغطي" /> <B>«إضافة»</B> في أعلى الشاشة</Step>
          {openIconStep}
        </Steps>
      );
    }
    if (device.browser === "chrome") {
      return (
        <Steps>
          <Step icon={<Share />}>
            <V m="اضغط" f="اضغطي" /> زر <B>المشاركة</B> في شريط العنوان أعلى الشاشة
          </Step>
          <Step icon={<SquarePlus />}>
            <V m="اختر" f="اختاري" /> <B>«إضافة إلى الشاشة الرئيسية»</B>، ثم <B>«إضافة»</B>
          </Step>
          {openIconStep}
        </Steps>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          على iPhone يتم التثبيت من <B>Safari</B>. <V m="انسخ" f="انسخي" /> الرابط <V m="وافتحه" f="وافتحيه" /> في Safari، ثم <V m="اضغط" f="اضغطي" /> زر المشاركة <V m="واختر" f="واختاري" /> «إضافة إلى الشاشة الرئيسية».
        </p>
        <CopyLink />
      </div>
    );
  }

  if (device.os === "android") {
    if (device.browser === "samsung") {
      return (
        <Steps>
          <Step icon={<Menu />}>
            <V m="اضغط" f="اضغطي" /> زر <B>القائمة ☰</B> أسفل الشاشة
          </Step>
          <Step icon={<SquarePlus />}>
            <V m="اختر" f="اختاري" /> <B>«إضافة صفحة إلى»</B> ثم <B>«الشاشة الرئيسية»</B>
          </Step>
          {openIconStep}
        </Steps>
      );
    }
    return (
      <Steps>
        <Step icon={<MoreVertical />}>
          <V m="اضغط" f="اضغطي" /> زر <B>⋮</B> في أعلى الشاشة
        </Step>
        <Step icon={<Download />}>
          <V m="اختر" f="اختاري" /> <B>«تثبيت التطبيق»</B> أو <B>«إضافة إلى الشاشة الرئيسية»</B>، ثم <B>«تثبيت»</B>
        </Step>
        {openIconStep}
      </Steps>
    );
  }

  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      على الكمبيوتر لا حاجة للتثبيت: <V m="فعّل" f="فعّلي" /> الإشعارات من الأسفل لتصلك التنبيهات. وفي Chrome أو Edge يمكنك التثبيت من أيقونة التثبيت في شريط العنوان.
    </p>
  );
}

/** How to allow notifications again after "Block", per device. */
export function UnblockSteps({ device }: { device: Device }) {
  if (device.os === "ios") {
    return (
      <Steps>
        <Step icon={<Settings />}>
          <V m="افتح" f="افتحي" /> <B>الإعدادات</B> في iPhone ثم <B>الإشعارات</B>
        </Step>
        <Step icon={<Smartphone />}>
          <V m="اختر" f="اختاري" /> <B>نصيبك</B> من القائمة
        </Step>
        <Step icon={<BellRing />}>
          <V m="فعّل" f="فعّلي" /> <B>«السماح بالإشعارات»</B>
        </Step>
      </Steps>
    );
  }
  if (device.os === "android" && device.standalone) {
    return (
      <Steps>
        <Step icon={<Smartphone />}>
          <V m="اضغط" f="اضغطي" /> مطولاً على <B>أيقونة نصيبك</B> ثم <B>«معلومات التطبيق»</B>
        </Step>
        <Step icon={<BellRing />}>
          <V m="افتح" f="افتحي" /> <B>الإشعارات</B> <V m="وفعّلها" f="وفعّليها" />
        </Step>
      </Steps>
    );
  }
  if (device.os === "android" && device.browser === "samsung") {
    return (
      <Steps>
        <Step icon={<Menu />}>
          <V m="اضغط" f="اضغطي" /> <B>☰</B> ثم <B>الإعدادات</B> ثم <B>المواقع والتنزيلات</B>
        </Step>
        <Step icon={<BellRing />}>
          <V m="اختر" f="اختاري" /> <B>الإشعارات</B>، ثم <V m="اسمح" f="اسمحي" /> لـ <span dir="ltr">naseebak.com</span>
        </Step>
      </Steps>
    );
  }
  return (
    <Steps>
      <Step icon={<Lock />}>
        <V m="اضغط" f="اضغطي" /> رمز <B>القفل</B> أو <B>الإعدادات</B> بجانب رابط الموقع في شريط العنوان
      </Step>
      <Step icon={<BellRing />}>
        <V m="اختر" f="اختاري" /> <B>الأذونات</B> ثم <B>الإشعارات</B> <V m="وغيّرها" f="وغيّريها" /> إلى <B>«سماح»</B>
      </Step>
    </Steps>
  );
}

/** Current notification state on this device, with the next thing to do. */
export function NotificationHelp({ device }: { device: Device }) {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(pushPermission());
  }, []);

  async function enable() {
    setBusy(true);
    try {
      await requestPushPermission();
    } finally {
      setPermission(pushPermission());
      setBusy(false);
    }
  }

  if (permission === "granted") {
    return (
      <p className="flex items-start gap-2 text-sm leading-relaxed text-green-700">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <span>الإشعارات مفعّلة على هذا الجهاز. إن لم تصلك، <V m="تأكد" f="تأكدي" /> أن وضع «عدم الإزعاج» أو «التركيز» لا يحجبها.</span>
      </p>
    );
  }

  if (permission === "unsupported") {
    return (
      <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
        <BellOff className="mt-0.5 h-5 w-5 shrink-0" />
        <span>
          {device.inApp
            ? <>لا تعمل الإشعارات داخل متصفح التطبيقات. <V m="افتح" f="افتحي" /> نصيبك في المتصفح كما في الخطوات أعلاه.</>
            : device.os === "ios"
              ? "على iPhone تعمل الإشعارات فقط بعد تثبيت نصيبك على الشاشة الرئيسية وفتحه من الأيقونة (iOS 16.4 أو أحدث)."
              : <>هذا المتصفح لا يدعم الإشعارات. <V m="جرّب" f="جرّبي" /> Chrome أو Safari.</>}
        </span>
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-800">
          <BellOff className="mt-0.5 h-5 w-5 shrink-0" />
          <span>الإشعارات محظورة على هذا الجهاز، ولا يمكن طلبها من جديد من داخل الموقع. لتفعيلها:</span>
        </p>
        <UnblockSteps device={device} />
        <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
          فعّلتها، <V m="حدّث" f="حدّثي" /> الصفحة
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        <V m="اضغط" f="اضغطي" /> الزر ثم <V m="اختر" f="اختاري" /> <B>«سماح»</B> في النافذة التي ستظهر.
      </p>
      <Button type="button" onClick={enable} disabled={busy} className="gap-1.5">
        <BellRing className="h-4 w-4" />
        تفعيل الإشعارات
      </Button>
    </div>
  );
}
