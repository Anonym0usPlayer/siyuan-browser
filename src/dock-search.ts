/** Pull down to reveal; push up to collapse, even when the list cannot scroll. */
export function installDockSearch(
  list: HTMLElement,
  search: HTMLInputElement,
  shell: HTMLElement = search,
) {
  list.tabIndex = 0;
  const show = () => {
    shell.hidden = false;
    search.hidden = false;
  };
  const hide = () => {
    const focused =
      document.activeElement === search ||
      shell.contains(document.activeElement);
    if (search.value) {
      search.value = "";
      search.dispatchEvent(
        new search.ownerDocument.defaultView!.Event("input", { bubbles: true }),
      );
    }
    shell.hidden = true;
    search.hidden = true;
    if (focused) list.focus();
  };
  hide();
  let pull = 0;
  let lastWheel = 0;
  list.addEventListener(
    "wheel",
    (event) => {
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? Math.max(40, list.clientHeight)
            : 1);
      if (
        !delta ||
        (search.hidden && (list.scrollTop > 0 || delta > 0)) ||
        (!search.hidden && delta < 0)
      ) {
        pull = 0;
        return;
      }
      if (
        event.timeStamp - lastWheel > 200 ||
        Math.sign(delta) !== Math.sign(pull)
      )
        pull = 0;
      lastWheel = event.timeStamp;
      pull += delta;
      if (Math.abs(pull) >= 40) {
        if (pull > 0) hide();
        else show();
        pull = 0;
      }
    },
    { passive: true },
  );
  const drag = (distance: number) => {
    if (distance >= 40 && list.scrollTop <= 0 && search.hidden) {
      show();
      return true;
    }
    if (distance <= -40 && !search.hidden) {
      hide();
      return true;
    }
    return false;
  };
  let pointer: { id: number; y: number } | undefined;
  list.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      (event.target as Element).closest("input, button, a")
    )
      return;
    pointer = { id: event.pointerId, y: event.clientY };
  });
  list.addEventListener("pointermove", (event) => {
    if (pointer?.id === event.pointerId && drag(event.clientY - pointer.y))
      pointer = undefined;
  });
  for (const name of ["pointerup", "pointercancel", "pointerleave"])
    list.addEventListener(name, () => {
      pointer = undefined;
    });
  let touchY: number | undefined;
  list.addEventListener(
    "touchstart",
    (event) => {
      touchY =
        event.touches.length === 1 ? event.touches[0].clientY : undefined;
    },
    { passive: true },
  );
  list.addEventListener(
    "touchmove",
    (event) => {
      if (
        touchY !== undefined &&
        event.touches.length === 1 &&
        drag(event.touches[0].clientY - touchY)
      )
        touchY = undefined;
    },
    { passive: true },
  );
  for (const name of ["touchend", "touchcancel"])
    list.addEventListener(name, () => {
      touchY = undefined;
    });
  list.addEventListener("scroll", () => {
    if (
      !search.hidden &&
      list.scrollTop > shell.offsetHeight &&
      !search.value &&
      document.activeElement !== search
    )
      hide();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      hide();
    }
  });
  list.addEventListener("keydown", (event) => {
    if (
      event.target === list &&
      event.key === "ArrowUp" &&
      list.scrollTop <= 0
    ) {
      event.preventDefault();
      show();
      search.focus();
    }
  });
  return { show, hide };
}
