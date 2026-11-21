API handler tests belong directly under this directory and run without database credentials. The runner clears database URL variables for that group.

Tests that need PostgreSQL belong under `database/`. They run only with an explicit `TEST_DATABASE_URL` pointing to a local PostgreSQL database whose name ends in `_test`. The runner passes that URL as both `DATABASE_URL` and `DIRECT_URL`; it never falls back to either inherited value. Tests must clean up any rows they create.
