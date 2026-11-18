# Tester Checklist

Here is the quick test lap:

Use a disposable vault and a synthetic feed first. Do not use a shared or production calendar for failure testing.

- Add one calendar feed and run `Sync now`.
- Run `Sync now` and confirm the calendar note is created.
- Complete one imported task, sync again, and confirm it stays completed.
- Try a recurring event.
- Try an all-day event.
- Try a multi-day event.
- Try an event with a location or description.
- Confirm Error Reporting does not list events entirely outside the selected sync window, but does explain an overlapping event excluded by a setting or filter.
- Complete an excluded event, sync again, and confirm it does not appear in Error Reporting.
- Confirm private feed links are not shown in normal status messages.
- Confirm Tasks queries can find imported events.
- Disconnect the network, run a sync, and confirm the last good tasks remain untouched.
- Turn off **Create note if missing**, choose a nonexistent destination, and sync. Confirm it reports the missing note without creating it or its parent folders.
- Run the same import twice and confirm task counts and completion states stay the same. After an interrupted or failed note write, retry and check for duplicates.
- While a sync or completion action is waiting, switch the device to read-only. Confirm later note writes are refused; changes already finished before the switch remain.
- On iPhone, iPad, or Android, install or update through Community Plugins and run one sync while Obsidian is active.
- With two devices sharing a vault, turn off **Write calendar notes on this device** on the secondary device. Confirm its manual sync does not fetch feeds or edit notes, but it can still tick a synced task. After the vault syncs, run the writer and confirm the task stays checked.
- Test a note with repeated calendar sections and checked/unchecked copies of one event. Confirm the next writer sync creates a `.bak` file and leaves one checked copy.

If something feels off, please include:

- Obsidian version
- Operating system
- Calendar provider
- Whether the event is timed, all-day, recurring, or a reminder
- Any error shown in Calendar Importer settings

Please do not share private calendar feed links in issue reports.
