export type CalendarEventData = {
    title: string;
    description: string;
    location: string;
    startDate: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    durationMinutes: number; // in minutes
};

function normalizeTime(time: string): string {
    if (!time) return "12:00";
    // Already HH:mm, HH:mm:ss, or HH:mm with explicit timezone offset
    if (/^\d{1,2}:\d{2}(:\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(time.trim())) {
        return time.trim();
    }
    // 12-hour format like "2:00 PM"
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const period = match[3].toLowerCase();
        if (period === "pm" && hours < 12) hours += 12;
        if (period === "am" && hours === 12) hours = 0;
        return `${String(hours).padStart(2, "0")}:${minutes}`;
    }
    return "12:00";
}

function formatUtcDateTimeStamp(value: Date): string {
    const safeValue = Number.isNaN(value.getTime()) ? new Date() : value;
    const year = String(safeValue.getUTCFullYear());
    const month = String(safeValue.getUTCMonth() + 1).padStart(2, "0");
    const day = String(safeValue.getUTCDate()).padStart(2, "0");
    const hours = String(safeValue.getUTCHours()).padStart(2, "0");
    const minutes = String(safeValue.getUTCMinutes()).padStart(2, "0");
    const seconds = String(safeValue.getUTCSeconds()).padStart(2, "0");

    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function hasExplicitTimezone(value: string): boolean {
    return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function parseDateParts(dateStr: string) {
    const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    return {
        year: Number.parseInt(match[1], 10),
        month: Number.parseInt(match[2], 10),
        day: Number.parseInt(match[3], 10),
    };
}

function parseTimeParts(timeStr: string) {
    const normalizedTime = normalizeTime(timeStr);
    const match = normalizedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:Z|[+-]\d{2}:?\d{2})?$/i);
    if (!match) return null;

    return {
        hours: Number.parseInt(match[1], 10),
        minutes: Number.parseInt(match[2], 10),
        seconds: Number.parseInt(match[3] || "0", 10),
    };
}

function safeParseDate(dateStr: string, timeStr: string): Date {
    const trimmedDate = dateStr.trim();
    const normalizedTime = normalizeTime(timeStr);

    if (trimmedDate.includes("T") || trimmedDate.includes(" ")) {
        const fullyQualified = new Date(trimmedDate);
        if (!Number.isNaN(fullyQualified.getTime())) return fullyQualified;
    }

    if (trimmedDate && hasExplicitTimezone(normalizedTime)) {
        const withTimezone = new Date(`${trimmedDate}T${normalizedTime}`);
        if (!Number.isNaN(withTimezone.getTime())) return withTimezone;
    }

    const dateParts = parseDateParts(trimmedDate);
    const timeParts = parseTimeParts(normalizedTime);
    if (dateParts && timeParts) {
        const localDate = new Date(
            dateParts.year,
            dateParts.month - 1,
            dateParts.day,
            timeParts.hours,
            timeParts.minutes,
            timeParts.seconds
        );
        if (!Number.isNaN(localDate.getTime())) return localDate;
    }

    const dateOnly = new Date(trimmedDate);
    if (!Number.isNaN(dateOnly.getTime())) return dateOnly;

    return new Date();
}

export function generateICSContent(data: CalendarEventData): string {
    const startObj = safeParseDate(data.startDate, data.startTime);
    const endObj = new Date(startObj.getTime() + data.durationMinutes * 60000);

    const dtstart = formatUtcDateTimeStamp(startObj);
    const dtend = formatUtcDateTimeStamp(endObj);
    const dtstamp = formatUtcDateTimeStamp(new Date());

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//OnlyWorkshops//Event Calendar//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `DTSTAMP:${dtstamp}`,
        `UID:${dtstamp}-${crypto.randomUUID()}@onlyworkshops.com`,
        `SUMMARY:${data.title.replace(/,/g, "\\,")}`,
        `DESCRIPTION:${data.description.replace(/\n/g, "\\n").replace(/,/g, "\\,")}`,
        `LOCATION:${data.location.replace(/,/g, "\\,")}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ];
    return lines.join("\r\n");
}

export function downloadICSFile(data: CalendarEventData, filename: string = "workshop.ics") {
    const content = generateICSContent(data);
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function generateGoogleCalendarUrl(data: CalendarEventData): string {
    const startObj = safeParseDate(data.startDate, data.startTime);
    const endObj = new Date(startObj.getTime() + data.durationMinutes * 60000);

    const dtstart = formatUtcDateTimeStamp(startObj);
    const dtend = formatUtcDateTimeStamp(endObj);

    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.append("action", "TEMPLATE");
    url.searchParams.append("dates", `${dtstart}/${dtend}`);
    url.searchParams.append("text", data.title);
    url.searchParams.append("details", data.description);
    url.searchParams.append("location", data.location);

    return url.toString();
}

export function parseDurationToMinutes(durationStr: string): number {
    const lower = durationStr.toLowerCase();
    const hoursMatch = lower.match(/(\d+(?:\.\d+)?)\s*h(?:our)?s?/);
    const minutesMatch = lower.match(/(\d+(?:\.\d+)?)\s*m(?:inute)?s?/);

    let totalMinutes = 0;
    if (hoursMatch) totalMinutes += parseFloat(hoursMatch[1]) * 60;
    if (minutesMatch) totalMinutes += parseFloat(minutesMatch[1]);

    if (totalMinutes === 0) return 60; // default 1 hour fallback
    return totalMinutes;
}
