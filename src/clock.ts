import type { DressingClock } from "./types.js";

/** Keeps laptop and phone on the same calendar day when both use the same timezone. */
export function createTimeZoneClock(timeZone="Europe/Dublin"):DressingClock {
  const fmt=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"});
  return {
    today(){
      const parts=Object.fromEntries(fmt.formatToParts(new Date()).map(p=>[p.type,p.value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    }
  };
}
