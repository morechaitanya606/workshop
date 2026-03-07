When you share the map API key, I’ll implement this end-to-end:

Admin form: add eventAddress (and optional lat/lng override).
Save in DB: address, latitude, longitude, and location_images[].
On workshop page: show map preview (pin at event location) + location image gallery.
Add fallback handling if map/geocoding fails (address text still shown).
For later, keep these ready:

Preferred map provider (Google Maps is fine).
API key for server + client usage.
Whether location images are uploaded by admin or auto-fetched from places API.
If you want, I can prepare the DB + UI structure now and only plug in the map key later.



