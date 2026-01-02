// Utilities for calculating Copenhagen (CET/CEST) week boundaries using Luxon
// Week runs Monday 00:00:00.000 to Sunday 23:59:59.999 in Europe/Copenhagen timezone

import { DateTime } from 'luxon';

export {};

/**
 * Returns the start and end of the calendar week (Monday 00:00 to Sunday 23:59:59.999) in Europe/Copenhagen timezone,
 * and a string label of the week (YYYY-W## format, e.g. 2025-W52).
 */
export function getWeekRangeCET(input: Date) {
  // Convert input to Luxon DateTime in "Europe/Copenhagen" zone
  const dt = DateTime.fromJSDate(input, { zone: 'Europe/Copenhagen' });

  // Find the start of the week (Monday) at 00:00:00.000
  const weekStart = dt.startOf('week');

  // Find the end of the week (Sunday) at 23:59:59.999
  const weekEnd = dt.endOf('week');

  // Build week label as YYYY-W## (ISO week format)
  const year = weekStart.year;
  const weekNumber = weekStart.weekNumber;
  const weekLabel = `${year}-W${weekNumber.toString().padStart(2, '0')}`;

  return {
    weekStartCET: weekStart.toJSDate(),
    weekEndCET: weekEnd.toJSDate(),
    weekLabel: weekLabel,
  };
}

/*
Example usage / self-test:

// npm install luxon
const date = new Date('2025-12-15T12:30:00Z'); // Any day in week 51 of 2025
const res = getWeekRangeCET(date);
console.log(res);
// Output might be:
// {
//   weekStartCET: 2025-12-15T00:00:00.000+01:00 (CET/CEST local date, Monday),
//   weekEndCET: 2025-12-21T23:59:59.999+01:00 (Sunday),
//   weekLabel: "2025-W51"
// }
*/

