import { Duration, Period } from "@js-joda/core";

function postgresIntervalToJsJoda(r: postgresinterval): {
  period: Period;
  duration: Duration;
} {
  console.dir(r);
  let d = Duration.ofMillis(r.milliseconds || 0);
  if (r.seconds) {
    d = d.plusSeconds(r.seconds);
  }
  if (r.minutes) {
    d = d.plusMinutes(r.minutes);
  }
  if (r.hours) {
    d = d.plusHours(r.hours);
  }

  let p = Period.ofDays(r.days || 0);
  if (r.months) {
    p = p.plusMonths(r.months);
  }
  if (r.years) {
    p = p.plusYears(r.years);
  }

  return { period: p, duration: d };
}

type postgresinterval = {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
};
