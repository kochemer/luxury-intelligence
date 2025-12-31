// Utilities for calculating Copenhagen (CET/CEST) month boundaries using Luxon

import { DateTime } from 'luxon';

export {};

/**
 * Returns the start and end of the calendar month (first day 00:00 to last day 23:59:59.999) in Europe/Copenhagen timezone,
 * and a string label of the month (YYYY-MM).
 */
export function getMonthRangeCET(input: Date) {
  // Convert input to Luxon DateTime in "Europe/Copenhagen" zone
  const dt = DateTime.fromJSDate(input, { zone: 'Europe/Copenhagen' });

  // Find the first day of this month at 00:00:00.000
  const monthStart = dt.startOf('month');

  // Find the last day of this month at 23:59:59.999
  const monthEnd = dt.endOf('month');

  // Build month label as YYYY-MM in CET/CEST (consistent with local representation)
  const monthLabel = `Month: ${monthStart.toFormat('yyyy-MM')} (CET)`;

  return {
    monthStartCET: monthStart.toJSDate(),
    monthEndCET: monthEnd.toJSDate(),
    monthLabel: monthLabel,
  };
}

/*
Example usage / self-test:

// npm install luxon
const date = new Date('2024-06-10T12:30:00Z'); // Any day in June 2024
const res = getMonthRangeCET(date);
console.log(res);
// Output might be:
// {
//   monthStartCET: 2024-06-01T00:00:00.000+02:00 (CET/CEST local date),
//   monthEndCET: 2024-06-30T23:59:59.999+02:00,
//   monthLabel: "Month: 2024-06 (CET)"
// }
*/

