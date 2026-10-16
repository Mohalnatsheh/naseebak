import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InterestDialog } from "@/components/suggestions/interest-dialog";
import { LockedSuggestionCard } from "@/components/suggestions/locked-suggestion-card";

type Props = Parameters<typeof InterestDialog>[0];

function setup(over: Partial<Props> = {}) {
  const onConfirm = vi.fn(async () => {});
  const props: Props = {
    open: true,
    onOpenChange: vi.fn(),
    partnerGender: "FEMALE",
    credits: 3,
    chatEnabled: true,
    guardian: { exists: true, consented: true },
    onConfirm,
    ...over,
  };
  render(<InterestDialog {...props} />);
  return { onConfirm, confirm: () => screen.getByRole("button", { name: /تأكيد/ }) };
}

describe("InterestDialog", () => {
  it("requires a choice", async () => {
    const { onConfirm, confirm } = setup();
    expect(confirm()).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /محادثة هنا أولاً/ }));
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ introPreference: "CHAT" }));
  });

  it("FAMILY without consent shows the checkbox and blocks confirm until ticked", async () => {
    const { onConfirm, confirm } = setup({ guardian: { exists: true, consented: false } });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ }));
    const box = screen.getByRole("checkbox", { name: "أوافق على مشاركة اسم ورقم ولي الأمر" });
    expect(confirm()).toBeDisabled();
    fireEvent.click(box);
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ introPreference: "FAMILY", guardianConsent: true }));
  });

  it("FAMILY with consent already given needs no checkbox", async () => {
    const { onConfirm, confirm } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ introPreference: "FAMILY" }));
  });

  it("FAMILY without a guardian links to the guardian step and blocks confirm", () => {
    const { confirm } = setup({ guardian: { exists: false, consented: false } });
    fireEvent.click(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ }));
    expect(screen.getByRole("link", { name: /بيانات وليّ الأمر/ })).toHaveAttribute("href", "/dashboard/profile/edit?step=5");
    expect(confirm()).toBeDisabled();
  });

  it("chat option hidden when chat disabled", () => {
    setup({ chatEnabled: false });
    expect(screen.queryByRole("radio", { name: /محادثة هنا أولاً/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ })).toBeInTheDocument();
  });

  it("shows the balance hint", () => {
    setup({ credits: 4 });
    expect(screen.getByText("مهتم يستخدم رصيداً واحداً — رصيدك 4")).toBeInTheDocument();
  });

  it("at 0 credits offers a recharge link instead of confirm", () => {
    setup({ credits: 0 });
    expect(screen.queryByRole("button", { name: /تأكيد/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اشحن رصيدك للمتابعة" })).toHaveAttribute("href", "/dashboard/payments");
  });

  it("feminine imperatives for a woman (partner is a man)", () => {
    setup({ partnerGender: "MALE", credits: 0 });
    expect(screen.getByRole("link", { name: "اشحني رصيدك للمتابعة" })).toBeInTheDocument();
  });
});

describe("LockedSuggestionCard", () => {
  it("locked card shows recharge CTA and no buttons", () => {
    render(<LockedSuggestionCard score={78} partnerGender="FEMALE" />);
    const cta = screen.getByRole("link", { name: /اشحن رصيدك لعرض الاقتراح والرد/ });
    expect(cta).toHaveAttribute("href", "/dashboard/payments");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "نسبة التوافق 78%" })).toBeInTheDocument();
    expect(screen.queryByText(/اهتمام/)).not.toBeInTheDocument();
  });

  it("liked-you tag by genders", () => {
    const { rerender } = render(<LockedSuggestionCard score={70} likedYou partnerGender="FEMALE" />);
    expect(screen.getByText("أبدت اهتمامها بك — اشحن رصيدك لترد")).toBeInTheDocument();
    rerender(<LockedSuggestionCard score={70} likedYou partnerGender="MALE" />);
    expect(screen.getByText("أبدى اهتمامه بك — اشحني رصيدك لتردّي")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /اشحني رصيدك/ })).toHaveAttribute("href", "/dashboard/payments");
  });
});
