"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChat } from "@/components/agent-chat";
import { AgentViewer } from "@/components/agent-viewer";

export default function BrowserAgentPage() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLElement | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);
  // Only mount the VNC iframe once a run has started — avoids the ubuntu
  // splash being visible on first load and prevents the iframe from pulling
  // snap-mandatory scroll to the viewer section before anything is running.
  const [viewerReady, setViewerReady] = useState(false);

  // Always land on the chat section, even if the browser tries to restore
  // a previous scroll position.
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const scrollTo = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleScrollToViewer = useCallback(() => {
    setViewerReady(true);
    // Give React one tick to mount the iframe before scrolling.
    requestAnimationFrame(() => {
      scrollTo(viewerRef);
    });
  }, [scrollTo]);

  return (
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-6 lg:-mx-8 lg:-my-8">
      <div
        ref={scrollerRef}
        className="overflow-y-auto snap-y snap-mandatory overscroll-contain"
        style={{ height: "calc(100dvh - 3.5rem)", scrollBehavior: "smooth" }}
      >
        <section
          ref={chatRef}
          className="snap-start flex flex-col px-4 md:px-6 lg:px-8 py-4 md:py-6"
          style={{ height: "calc(100dvh - 3.5rem)" }}
        >
          <AgentChat onScrollToViewer={handleScrollToViewer} />
        </section>
        <section
          ref={viewerRef}
          className="snap-start flex flex-col px-4 md:px-6 lg:px-8 py-4 md:py-6"
          style={{ height: "calc(100dvh - 3.5rem)" }}
        >
          <AgentViewer onScrollToChat={() => scrollTo(chatRef)} active={viewerReady} />
        </section>
      </div>
    </div>
  );
}
