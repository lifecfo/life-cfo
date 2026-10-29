import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = {
  title: `Account deleted | ${PRODUCT_NAME}`,
  robots: { index: false, follow: false },
};

export default function AccountDeletedPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-brand-teal to-[#174544] flex items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[42%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/8 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="relative flex justify-center -mb-1">
            <div className="absolute h-28 w-28 rounded-full bg-white/10 blur-3xl sm:h-36 sm:w-36" />
            <Image
              src="/brand/lifecfo-logo-stacked-white-transparent.svg"
              alt={PRODUCT_NAME}
              width={180}
              height={180}
              priority
              className="relative h-auto w-[190px] sm:w-[230px]"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/20 bg-neutral-surface p-6 text-center shadow-[0_30px_80px_rgba(0,0,0,0.28),0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-[2px]">
          <div className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight text-neutral-text">
              Your account has been deleted
            </h1>

            <p className="text-sm leading-relaxed text-neutral-text-2">
              Your Life CFO account and its data have been removed, and you&rsquo;ve been signed out.
            </p>

            <p className="text-sm leading-relaxed text-neutral-text-2">
              If you shared a household with someone else, it stays in place for them.
            </p>

            <p className="text-sm leading-relaxed text-neutral-text-2">
              Changed your mind? You&rsquo;ll need to create a new account. While we&rsquo;re in beta, that also
              needs an invite code.
            </p>

            <div className="pt-2">
              <Link href="/login" className="block">
                <Button type="button" variant="primary" size="lg" className="w-full">
                  Back to Life CFO
                </Button>
              </Link>
            </div>

            <p className="pt-1 text-xs text-neutral-muted">Thanks for trying Life CFO.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
