import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InterestDialog } from "@/components/suggestions/interest-dialog";

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

  it("FAMILY without a guardian asks for it in the dialog, then allows confirm", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ parentInfo: { id: "g1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { onConfirm, confirm } = setup({ guardian: { exists: false, consented: false } });
    fireEvent.click(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ }));
    expect(confirm()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("اسم ولي الأمر"), { target: { value: "محمد أحمد" } });
    fireEvent.change(screen.getByLabelText("رقم هاتف ولي الأمر"), { target: { value: "0791234567" } });
    fireEvent.click(screen.getByRole("button", { name: "الأب" }));
    fireEvent.change(screen.getByLabelText("العنوان"), { target: { value: "عمّان، الجبيهة" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ بيانات وليّ الأمر" }));

    await waitFor(() => expect(confirm()).toBeEnabled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    // Contact only: the consent goes with the «مهتم» and is stored only if it goes through
    expect(body).toMatchObject({ parentName: "محمد أحمد", relationship: "father" });
    expect(body).not.toHaveProperty("shareConsent");
    fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ introPreference: "FAMILY", guardianConsent: true }));
    vi.unstubAllGlobals();
  });

  it("guardian saved in the dialog, then cancelled: no consent was ever stored (contact kept)", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ parentInfo: { id: "g1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const props: Props = {
      open: true, onOpenChange: vi.fn(), partnerGender: "FEMALE", credits: 3, chatEnabled: true,
      guardian: { exists: false, consented: false }, onConfirm: vi.fn(async () => {}),
    };
    const { rerender } = render(<InterestDialog {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ }));
    fireEvent.change(screen.getByLabelText("اسم ولي الأمر"), { target: { value: "محمد أحمد" } });
    fireEvent.change(screen.getByLabelText("رقم هاتف ولي الأمر"), { target: { value: "0791234567" } });
    fireEvent.click(screen.getByRole("button", { name: "الأب" }));
    fireEvent.change(screen.getByLabelText("العنوان"), { target: { value: "عمّان، الجبيهة" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ بيانات وليّ الأمر" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /تأكيد/ })).toBeEnabled());

    const [, saveInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(saveInit.body as string)).not.toHaveProperty("shareConsent");
    rerender(<InterestDialog {...props} open={false} />);
    await new Promise((r) => setTimeout(r, 20));
    // Nothing to take back
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("guardian saved in the dialog and the family «مهتم» went through: the consent stays", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ parentInfo: { id: "g1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onConfirm = vi.fn(async () => true);
    const props: Props = {
      open: true, onOpenChange: vi.fn(), partnerGender: "FEMALE", credits: 3, chatEnabled: true,
      guardian: { exists: false, consented: false }, onConfirm,
    };
    const { rerender } = render(<InterestDialog {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ }));
    fireEvent.change(screen.getByLabelText("اسم ولي الأمر"), { target: { value: "محمد أحمد" } });
    fireEvent.change(screen.getByLabelText("رقم هاتف ولي الأمر"), { target: { value: "0791234567" } });
    fireEvent.click(screen.getByRole("button", { name: "الأب" }));
    fireEvent.change(screen.getByLabelText("العنوان"), { target: { value: "عمّان، الجبيهة" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ بيانات وليّ الأمر" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /تأكيد/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /تأكيد/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    rerender(<InterestDialog {...props} open={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("an error from the server is shown inside the dialog, which stays open", async () => {
    const onOpenChange = vi.fn();
    const { confirm } = setup({ onConfirm: vi.fn(async () => "أضف بيانات وليّ الأمر في ملفك الشخصي أولاً"), onOpenChange });
    fireEvent.click(screen.getByRole("radio", { name: /محادثة هنا أولاً/ }));
    fireEvent.click(confirm());
    expect(await screen.findByRole("alert")).toHaveTextContent("أضف بيانات وليّ الأمر");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(confirm()).toBeEnabled();
  });

  it("FAMILY without a guardian: an invalid guardian is not saved", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { confirm } = setup({ guardian: { exists: false, consented: false } });
    fireEvent.click(screen.getByRole("radio", { name: /تعارف عائلي مباشرة/ }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ بيانات وليّ الأمر" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirm()).toBeDisabled();
    vi.unstubAllGlobals();
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

describe("InterestDialog cost only (older suggestions / received interests)", () => {
  it("skips the introduction choice and confirms the credit with no preference", async () => {
    const { onConfirm, confirm } = setup({ costOnly: true });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/مهتم يستخدم رصيداً واحداً/)).toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith());
  });
});
