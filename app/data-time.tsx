const kst = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export default function DataTime({ value }: { value: string }) {
  return <time dateTime={value}>{kst.format(new Date(value))}</time>;
}
