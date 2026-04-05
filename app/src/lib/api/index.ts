/**
 * Barrel re-export of all API domain modules.
 *
 * New code should import from the specific domain module, e.g.:
 *   import { getWorkshopById } from "@/lib/api/workshops";
 *
 * Existing code can keep importing from "@/lib/api" or "@/lib/api-client".
 */

export { ApiClientError, isApiClientError, toApiErrorMessage, apiRequest } from "./client";
export type { ApiRequestOptions } from "./client";

export * from "./workshops";
export * from "./bookings";
export * from "./chatbot";
export * from "./favorites";
export * from "./profile";
