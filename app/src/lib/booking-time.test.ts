import { describe, it, expect } from 'vitest';
import { getWorkshopDateTime } from './booking-time';

describe('getWorkshopDateTime', () => {
    it('should return a valid Date object for a valid date and time', () => {
        const result = getWorkshopDateTime('2024-05-15', '14:30');
        expect(result).toBeInstanceOf(Date);
        expect(result?.getTime()).not.toBeNaN();
        // The date parsed with "T" format like "2024-05-15T14:30:00" might be local time
        // We ensure it matches the constructed string behavior.
        const expected = new Date('2024-05-15T14:30:00');
        expect(result?.getTime()).toBe(expected.getTime());
    });

    it('should default to 00:00 if no time is provided', () => {
        const result = getWorkshopDateTime('2024-05-15');
        expect(result).toBeInstanceOf(Date);
        const expected = new Date('2024-05-15T00:00:00');
        expect(result?.getTime()).toBe(expected.getTime());
    });

    it('should default to 00:00 if time is null', () => {
        const result = getWorkshopDateTime('2024-05-15', null);
        const expected = new Date('2024-05-15T00:00:00');
        expect(result?.getTime()).toBe(expected.getTime());
    });

    it('should default to 00:00 if time is an empty string', () => {
        const result = getWorkshopDateTime('2024-05-15', '');
        const expected = new Date('2024-05-15T00:00:00');
        expect(result?.getTime()).toBe(expected.getTime());
    });

    it('should handle whitespace in time strings', () => {
        const result = getWorkshopDateTime('2024-05-15', '  10:00  ');
        const expected = new Date('2024-05-15T10:00:00');
        expect(result?.getTime()).toBe(expected.getTime());
    });

    it('should handle whitespace-only time strings by defaulting to 00:00', () => {
        const result = getWorkshopDateTime('2024-05-15', '   ');
        const expected = new Date('2024-05-15T00:00:00');
        expect(result?.getTime()).toBe(expected.getTime());
    });

    it('should return null if date is not provided', () => {
        // @ts-expect-error - testing invalid input
        expect(getWorkshopDateTime()).toBeNull();
        expect(getWorkshopDateTime('')).toBeNull();
    });

    it('should return null for invalid date strings', () => {
        expect(getWorkshopDateTime('not-a-date')).toBeNull();
        expect(getWorkshopDateTime('2024-13-45')).toBeNull();
    });

    it('should return null for invalid time strings', () => {
        expect(getWorkshopDateTime('2024-05-15', 'not-a-time')).toBeNull();
        // new Date('2024-05-15Tnot-a-time:00') results in NaN
    });
});
