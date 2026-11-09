-- The POI store is gone (decision 118 A4): builders' points of interest, their revisions and the assets they name, the
-- live feed's version, the library shelf and the daily upload counts. Dropping a table drops its indexes with it.
-- poi_revs references poi_docs, so the children are dropped first. The asset bytes in the SAVES bucket under `poi/a/`
-- are left orphaned: no code deletes them.
DROP TABLE poi_rev_assets;
DROP TABLE poi_revs;
DROP TABLE poi_docs;
DROP TABLE poi_assets;
DROP TABLE poi_feed;
DROP TABLE poi_shelf;
DROP TABLE poi_upload_days;
