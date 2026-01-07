'use client';

import { useState } from 'react';

type SubscribePricingProps = {
  formAction: string;
};

type Plan = 'promo' | 'regular' | null;

export default function SubscribePricing({ formAction }: SubscribePricingProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(null);

  const handleSelect = (plan: Plan) => {
    setSelectedPlan(plan);
    const emailSection = document.getElementById('subscribe-email');
    if (emailSection) {
      emailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section aria-labelledby="pricing-heading">
      <h2
        id="pricing-heading"
        className="text-lg sm:text-xl font-semibold text-gray-900 mb-4"
      >
        Pricing
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-4">
        {/* Promo plan */}
        <div className="relative rounded-xl border border-blue-200 bg-white shadow-sm p-4 sm:p-5 flex flex-col">
          <div className="absolute -top-3 left-4 inline-flex items-center rounded-full bg-blue-600 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
            Limited-time
          </div>
          <h3 className="mt-2 text-base sm:text-lg font-semibold text-gray-900">
            Promo
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-gray-600">
            Early supporters offer. Locked pricing for the first year once
            payments go live.
          </p>
          <div className="mt-4 mb-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">
                €1
              </span>
              <span className="text-xs text-gray-500">/ year</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSelect('promo')}
            className="mt-auto inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            aria-label="Select promo subscription (placeholder)"
          >
            Subscribe (placeholder)
          </button>
          <p className="mt-2 text-[11px] text-gray-500">
            No charge will be made. Payments are not enabled yet.
          </p>
        </div>

        {/* Regular plan */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 flex flex-col">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            Regular
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-gray-600">
            Standard pricing once the promo window closes.
          </p>
          <div className="mt-4 mb-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">
                €1
              </span>
              <span className="text-xs text-gray-500">/ month</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSelect('regular')}
            className="mt-auto inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            aria-label="Select regular subscription (placeholder)"
          >
            Subscribe (placeholder)
          </button>
          <p className="mt-2 text-[11px] text-gray-500">
            No charge will be made. Payments are not enabled yet.
          </p>
        </div>
      </div>

      {/* Inline message + email collection */}
      <div
        id="subscribe-email"
        className="mt-3 rounded-lg border border-dashed border-amber-200 bg-amber-50 px-4 py-3"
      >
        <p className="text-xs sm:text-sm text-amber-900 mb-2">
          {selectedPlan ? (
            <>
              Payment coming soon. You selected the{' '}
              <span className="font-semibold">
                {selectedPlan === 'promo' ? 'promo yearly' : 'regular monthly'}
              </span>{' '}
              option.
            </>
          ) : (
            <>
              Payment coming soon. Leave your email to be notified when
              subscriptions open.
            </>
          )}
        </p>
        <form
          method="POST"
          action={formAction}
          className="flex flex-col sm:flex-row gap-2 sm:items-center"
        >
          {/* Tag submissions so they can be filtered in the external form tool */}
          <input type="hidden" name="context" value="subscribe-interest" />
          {selectedPlan && (
            <input
              type="hidden"
              name="plan"
              value={selectedPlan === 'promo' ? 'promo_yearly' : 'regular_monthly'}
            />
          )}
          <label className="sr-only" htmlFor="subscribe-email-input">
            Email address
          </label>
          <input
            id="subscribe-email-input"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Optional email to be notified"
            className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-offset-amber-50"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-500"
          >
            Notify me
          </button>
        </form>
        <p className="mt-1 text-[11px] text-amber-900/80">
          Optional. Used only to let you know when payments are available.
        </p>
      </div>
    </section>
  );
}


