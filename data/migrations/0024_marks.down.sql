-- 0024_marks (down): drop the table and its index. All marks are lost.

DROP INDEX ux_marks_open;
DROP TABLE marks;
