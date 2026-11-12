-- Earlier imports trusted the locality text. Some records labelled São Paulo
-- had coordinates in other cities. Only mapped municipal districts remain.
DELETE FROM fsq_places WHERE neighborhood IS NULL;
