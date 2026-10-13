-- 0017_chat_proposals (down): drop the proposals (indexes go with the table). Open proposals are lost;
-- amendments they created stay, they are ordinary amendments with revisions.

DROP TABLE chat_proposals;
