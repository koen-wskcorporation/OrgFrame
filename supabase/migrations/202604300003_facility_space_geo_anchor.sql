begin;

-- Per-space geo anchor: when set + show flag enabled, the facility map editor
-- renders a Google Maps satellite layer behind the canvas, with the canvas
-- origin (0,0) sitting at (geo_anchor_lat, geo_anchor_lng) and 1 canvas unit
-- = 1 meter. v1 is north-up (no bearing) and 1:1 scale (no calibration).

alter table facilities.spaces
  add column if not exists geo_anchor_lat double precision null,
  add column if not exists geo_anchor_lng double precision null,
  add column if not exists geo_address text null,
  add column if not exists geo_show_map boolean not null default false;

-- Sanity: clamp lat/lng to plausible Earth ranges.
alter table facilities.spaces
  add constraint facility_spaces_geo_anchor_lat_range
    check (geo_anchor_lat is null or (geo_anchor_lat between -90 and 90));

alter table facilities.spaces
  add constraint facility_spaces_geo_anchor_lng_range
    check (geo_anchor_lng is null or (geo_anchor_lng between -180 and 180));

-- show_map only meaningful when an anchor exists; soft enforcement.
alter table facilities.spaces
  add constraint facility_spaces_geo_show_requires_anchor
    check (
      geo_show_map = false
      or (geo_anchor_lat is not null and geo_anchor_lng is not null)
    );

commit;
