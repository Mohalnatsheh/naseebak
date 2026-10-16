"use client";

import { useState } from "react";
import {
  User, Calendar, MapPin, MapPinned, Flag, Baby, Ruler, Weight, Palette, GraduationCap, BookOpen,
  Briefcase, Wallet, Moon, Cigarette, Activity, UtensilsCrossed, Car, Users, Gem, Home, Heart,
  Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";

/** Public profile fields shown on suggestion cards (no photos, no contact details). */
export interface CandidateDetailsData {
  age: number | null;
  city: string | null;
  area: string | null;
  nationality: string | null;
  education: string | null;
  fieldOfStudy: string | null;
  job: string | null;
  incomeRange: string | null;
  height: number | null;
  weight: number | null;
  skinColor: string | null;
  maritalStatus: string | null;
  childrenCount: number;
  religiosity: string | null;
  smokingStatus: string | null;
  hobbies: string | null;
  interests: string | null;
  lifestyle: string | null;
  beard: boolean | null;
  hijab: boolean | null;
  tribe: string | null;
  familyOriginArea: string | null;
  numberOfSiblings: number | null;
  housingType: string | null;
  cookingAbility: string | null;
  drivingLicense: boolean | null;
  willingToRelocate: string | null;
  familyValues: string | null;
}

/* ── Section row helper ── */
function InfoRow({
  icon: Icon,
  label,
  value,
  wide,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number | null | undefined;
  wide?: boolean;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 ${wide ? "col-span-2" : ""}`}>
      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary/60" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-muted-foreground/70 block leading-tight">{label}</span>
        <span className="text-sm font-semibold text-foreground truncate block">{value}</span>
      </div>
    </div>
  );
}

/* ── Collapsible section ── */
function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/40 rounded-xl overflow-hidden bg-card/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary/70" />
          </div>
          <span className="text-sm font-bold text-foreground">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-3 grid grid-cols-2 gap-2">{children}</div>}
    </div>
  );
}

/* ── Candidate expanded details shared component ── */
export function CandidateDetails({ c }: { c: CandidateDetailsData }) {
  return (
    <div className="px-5 md:px-6 pb-4 space-y-3" style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
      <Section title="المعلومات الشخصية" icon={User} defaultOpen={true}>
        <InfoRow icon={Calendar} label="العمر" value={c.age ? `${c.age} سنة` : null} />
        <InfoRow icon={MapPin} label="المدينة" value={c.city} />
        <InfoRow icon={MapPinned} label="المنطقة" value={c.area} />
        <InfoRow icon={Flag} label="الجنسية" value={c.nationality} />
        <InfoRow icon={User} label="الحالة الاجتماعية" value={c.maritalStatus} />
        <InfoRow icon={Baby} label="عدد الأبناء" value={c.childrenCount > 0 ? `${c.childrenCount}` : "لا يوجد"} />
        <InfoRow icon={Ruler} label="الطول" value={c.height ? `${c.height} سم` : null} />
        <InfoRow icon={Weight} label="الوزن" value={c.weight ? `${c.weight} كغ` : null} />
        <InfoRow icon={Palette} label="لون البشرة" value={c.skinColor} />
        {c.hijab !== null && c.hijab !== undefined && (
          <InfoRow icon={User} label="الحجاب" value={c.hijab ? "نعم" : "لا"} />
        )}
        {c.beard !== null && c.beard !== undefined && (
          <InfoRow icon={User} label="اللحية" value={c.beard ? "نعم" : "لا"} />
        )}
      </Section>
      <Section title="التعليم والعمل" icon={GraduationCap} defaultOpen={true}>
        <InfoRow icon={GraduationCap} label="المستوى التعليمي" value={c.education} />
        <InfoRow icon={BookOpen} label="التخصص" value={c.fieldOfStudy} />
        <InfoRow icon={Briefcase} label="الوظيفة" value={c.job} />
        <InfoRow icon={Wallet} label="مستوى الدخل" value={c.incomeRange} />
      </Section>
      <Section title="الدين ونمط الحياة" icon={Moon} defaultOpen={true}>
        <InfoRow icon={Moon} label="مستوى التدين" value={c.religiosity} />
        <InfoRow icon={Cigarette} label="التدخين" value={c.smokingStatus} />
        <InfoRow icon={Activity} label="نمط الحياة" value={c.lifestyle} />
        <InfoRow icon={UtensilsCrossed} label="القدرة على الطبخ" value={c.cookingAbility} />
        <InfoRow icon={Car} label="رخصة قيادة" value={c.drivingLicense !== null && c.drivingLicense !== undefined ? (c.drivingLicense ? "نعم" : "لا") : null} />
      </Section>
      <Section title="العائلة" icon={Users} defaultOpen={true}>
        <InfoRow icon={Gem} label="العشيرة" value={c.tribe} />
        <InfoRow icon={MapPinned} label="منطقة أصل العائلة" value={c.familyOriginArea} />
        <InfoRow icon={Users} label="عدد الإخوة" value={c.numberOfSiblings !== null && c.numberOfSiblings !== undefined ? `${c.numberOfSiblings}` : null} />
        <InfoRow icon={Home} label="نوع السكن" value={c.housingType} />
        <InfoRow icon={MapPin} label="الاستعداد للانتقال" value={c.willingToRelocate === "yes" ? "نعم" : c.willingToRelocate === "no" ? "لا" : c.willingToRelocate === "maybe" ? "ربما" : c.willingToRelocate} />
        <InfoRow icon={Heart} label="القيم العائلية" value={c.familyValues} wide />
      </Section>
      {(c.hobbies || c.interests) && (
        <Section title="الهوايات والاهتمامات" icon={Sparkles} defaultOpen={true}>
          {c.hobbies && (
            <div className="col-span-2 py-2">
              <span className="text-[11px] text-muted-foreground/70 block mb-2">الهوايات</span>
              <div className="flex flex-wrap gap-1.5">
                {c.hobbies.split("،").map((h, i) => (
                  <span key={`h-${i}`} className="inline-flex items-center rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs font-medium text-accent-foreground">{h.trim()}</span>
                ))}
              </div>
            </div>
          )}
          {c.interests && (
            <div className="col-span-2 py-2">
              <span className="text-[11px] text-muted-foreground/70 block mb-2">الاهتمامات</span>
              <div className="flex flex-wrap gap-1.5">
                {c.interests.split("،").map((interest2, i) => (
                  <span key={`i-${i}`} className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary">{interest2.trim()}</span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
