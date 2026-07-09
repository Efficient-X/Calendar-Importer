# Daily Note Recipes

Calendar Importer writes your events into one tidy calendar note. The [Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks) can then pull the useful bits into daily notes, dashboards, weekly notes, or wherever your brain likes to land.

These snippets assume the default calendar note path:

```text
Calendar/My Calendar Events
```

Change the `path includes` line if you write imported tasks somewhere else.

## The Tiny Daily Setup

Use this when you just want today, no ceremony.

````markdown
```tasks
not done
happens on today
path includes Calendar/My Calendar Events
description regex does not match /^$/
sort by happens
```
````

## Today With A Callout

Good for a daily note template. Loud enough to notice, not so loud that it starts wearing sunglasses indoors.

````markdown
> [!danger]+ Tasks due today
> ```tasks
> not done
> (due today) OR (scheduled today)
> description regex does not match /^$/
> sort by due
> sort by scheduled
> ```
````

## Next Three Days

Handy for the next little wave of appointments, bills, school stuff, and "apparently I agreed to that" moments.

````markdown
> [!caution]- Tasks due within 3 days
> ```tasks
> not done
> (due next 3 days AND due - 3 days) OR (scheduled tomorrow)
> description regex does not match /^$/
> sort by due
> sort by scheduled
> ```
````

## Rolling Calendar Dashboard

This pulls anything that starts, is scheduled, or is due before tomorrow. It is useful when imported tasks use a mix of due and scheduled dates.

````markdown
```tasks
not done
happens before tomorrow
path includes Calendar/My Calendar Events
group by happens
sort by happens
```
````

## This Week

Useful for weekly planning notes.

````markdown
```tasks
not done
happens in this week
path includes Calendar/My Calendar Events
group by happens
sort by happens
```
````

## One Calendar Feed Only

If you add feed tags in Calendar Importer, you can pull one calendar into a view. Great for shared calendars that deserve their own little stage.

````markdown
```tasks
not done
tag includes #family
path includes Calendar/My Calendar Events
sort by happens
```
````

## Hide The Noise

Use these lines in any query when you want less clutter.

```tasks
not done
description regex does not match /^$/
path includes Calendar/My Calendar Events
```

## Notes On The Syntax

Tasks supports date filters like `due today`, `scheduled tomorrow`, and `happens before tomorrow`. The `happens` filter is especially useful for imported calendar tasks because it can match start dates, scheduled dates, or due dates.

Useful official references:

- [Tasks filters](https://publish.obsidian.md/tasks/Queries/Filters)
- [Tasks grouping](https://publish.obsidian.md/tasks/Queries/Grouping)
- [Tasks sorting](https://publish.obsidian.md/tasks/Queries/Sorting)
