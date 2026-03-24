export type CalendarEventData = {
    title: string;
    description: string;
    location: string;
    startDate: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    durationMinutes: number; // in minutes
};

export function generateICSContent(data: CalendarEventData): string {
    const startObj = new Date(`${data.startDate}T${data.startTime}:00`);
    const endObj = new Date(startObj.getTime() + data.durationMinutes * 60000);

    const dtstart = startObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dtend = endObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

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
    const startObj = new Date(`${data.startDate}T${data.startTime}:00`);
    const endObj = new Date(startObj.getTime() + data.durationMinutes * 60000);

    const dtstart = startObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dtend = endObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

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
