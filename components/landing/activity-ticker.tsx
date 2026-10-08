// Scrolling strip of things happening across campus.
const events = [
  ["07:42", "Attendance marked", "Grade 9 'B'"],
  ["08:15", "Lesson published", "Physics · XI"],
  ["09:30", "Quiz auto-graded", "38 submissions"],
  ["10:05", "Admission approved", "BBS · Semester I"],
  ["11:20", "Assignment submitted", "Computer Science · XII"],
  ["12:40", "Notice sent", "Dashain holidays"],
  ["13:55", "Marks entered", "First Terminal · Maths"],
  ["15:10", "Fee received", "Receipt #4821"],
  ["16:30", "Leave approved", "Science department"],
  ["19:04", "Report viewed", "by a parent"],
]

function Track() {
  return (
    <ul className="flex shrink-0 items-center">
      {events.map(([time, what, where]) => (
        <li key={time + what} className="flex items-center gap-3 px-6 whitespace-nowrap">
          <span className="font-mono text-xs text-background/60">{time}</span>
          <span className="font-medium">{what}</span>
          <span className="text-background/60">{where}</span>
          <span aria-hidden className="ml-6 size-1.5 rotate-45 bg-primary" />
        </li>
      ))}
    </ul>
  )
}

export function ActivityTicker() {
  return (
    <div className="relative flex items-center overflow-hidden border-y bg-foreground py-3.5 text-sm text-background">
      <div className="relative z-10 flex shrink-0 items-center gap-2 bg-foreground pr-4 pl-4 sm:pl-6">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400" />
          <span className="relative size-2 rounded-full bg-emerald-400" />
        </span>
        <span className="font-mono text-xs tracking-widest uppercase">On campus</span>
      </div>
      <div
        aria-hidden
        className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none"
      >
        <Track />
        <Track />
      </div>
    </div>
  )
}
