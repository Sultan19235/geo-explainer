"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Props = React.IframeHTMLAttributes<HTMLIFrameElement> & {
  className?: string;
};

export function IframeWithLoader({
  className,
  src,
  onLoad,
  ...rest
}: Props) {
  const { t } = useT();
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <iframe
        {...rest}
        src={src}
        width="100%"
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        className="block h-full w-full border-0"
        style={{ border: 0 }}
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
          <div className="size-7 animate-spin rounded-full border-[2.5px] border-slate-200 border-t-blue-600" />
          <span className="text-xs font-medium text-muted-foreground">
            {t("loading")}
          </span>
        </div>
      )}
    </div>
  );
}
