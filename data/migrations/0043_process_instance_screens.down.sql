-- 0043_process_instance_screens (down): back to 0042; the instances lose their screens.

ALTER TABLE process_instances DROP COLUMN screens_json;
