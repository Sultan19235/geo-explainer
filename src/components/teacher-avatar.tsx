import { cn } from "@/lib/utils";
import type { Gender } from "@/lib/auth/gender";

// Flat silhouette avatars: ink figure on the sky tint, face "punched out"
// in the background color. Male = short-hair crescent, female = bob cut
// framing the face.
const BODY =
  "M20 25.2c-6.4 0-11.3 4.1-12.4 11.3L7.4 40h25.2l-.2-3.5C31.3 29.3 26.4 25.2 20 25.2Z";

export function TeacherAvatar({
  gender,
  className,
}: {
  gender: Gender | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent",
        className,
      )}
    >
      <svg
        viewBox="0 0 40 40"
        aria-hidden="true"
        className="size-full fill-primary"
      >
        {gender === "female" ? (
          <>
            <circle cx="20" cy="14.8" r="7.7" />
            <rect x="12.3" y="14.8" width="15.4" height="8.7" rx="3" />
            <circle cx="20" cy="18" r="5.7" className="fill-accent" />
            <path d={BODY} />
          </>
        ) : gender === "male" ? (
          <>
            <circle cx="20" cy="14.1" r="6.8" />
            <circle cx="20" cy="17.3" r="5.5" className="fill-accent" />
            <path d={BODY} />
          </>
        ) : (
          <>
            <circle cx="20" cy="15.8" r="6.3" />
            <path d={BODY} />
          </>
        )}
      </svg>
    </span>
  );
}
