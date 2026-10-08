import { useState } from "react";
import {
  ChessKingIcon,
  PlanningIcon,
  LogoIcon,
  LogoutIcon,
  PrioritiesIcon
} from "../icons";
import { NavLink } from "react-router";

type SidebarProps = {
  activePage?: "programacion" | "coordinador";
};

export default function Sidebar(_: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    {
      id: "programacion",
      label: "Programación",
      href: "/programacion",
      icon: <PlanningIcon className="h-8 w-8" />,
    },
    {
      id: "coordinador",
      label: "Coordinador",
      href: "/coordinador",
      icon: <ChessKingIcon className="h-8 w-8" />,
    },
    {
      id: "priorizar",
      label: "Priorizar",
      href: "/prioridades",
      icon: <PrioritiesIcon className="h-8 w-8" />,
    },
    
  ];

  return (
    <>
      {/* BOTÓN MENÚ - SOLO MÓVIL */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="
          fixed left-4 top-4 z-40
          flex h-11 w-11 items-center justify-center
          rounded-lg
          bg-[#014638]
          text-white
          shadow-md
          md:hidden
        "
        aria-label="Abrir menú"
      >
        <span className="text-2xl">☰</span>
      </button>

      {/* OVERLAY MÓVIL */}
      {isOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setIsOpen(false)}
          className="
            fixed inset-0 z-40
            bg-black/50
            md:hidden
          "
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed left-0 top-0 z-50

          flex
          h-screen
          flex-col

          bg-[#014638]
          text-white

          transition-transform
          duration-300

          w-[85%]
          max-w-[320px]

          md:sticky
          md:w-64
          md:max-w-none
          md:translate-x-0

          2xl:w-72

          min-[2560px]:w-80
          min-[3840px]:w-96

          ${
            isOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          }
        `}
      >
        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <div
          className="
            flex
            h-20
            shrink-0
            items-center
            justify-between

            border-b
            border-white/10

            px-6

            min-[3840px]:h-32
            min-[3840px]:px-10
          "
        >
          <div className="flex items-center gap-1">
            <LogoIcon className="h-22 w-22" />

            <div>
              <h1
                className="
                  text-xl
                  font-bold

                  min-[3840px]:text-4xl
                "
              >
                Production
              </h1>

              <p
                className="
                  text-sm
                  text-[#C3B880]

                  min-[3840px]:text-xl
                "
              >
                Planner
              </p>
            </div>
          </div>

          {/* CERRAR MENÚ - MÓVIL */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="
              flex
              h-10
              w-10
              items-center
              justify-center

              rounded-lg

              transition-colors
              hover:bg-white/10

              md:hidden
            "
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {/* ===================================================== */}
        {/* NAVEGACIÓN */}
        {/* ===================================================== */}

        <nav
          className="
            flex
            flex-1
            flex-col

            gap-2
            p-4

            min-[3840px]:gap-4
            min-[3840px]:p-8
          "
        >
          {menuItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.href}
              end={item.href === "/"}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) => `
                flex
                min-h-12
                items-center

                gap-3

                rounded-lg

                px-4

                text-base
                font-medium

                transition-colors

                min-[3840px]:min-h-20
                min-[3840px]:px-6
                min-[3840px]:text-2xl

                ${
                  isActive
                    ? "bg-[#8E1A32] text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }
              `}
            >
              <span className="shrink-0">
                {item.icon}
              </span>

              <span>
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* ===================================================== */}
        {/* CERRAR */}
        {/* ===================================================== */}

        <div
          className="
            border-t
            border-white/10

            p-4

            min-[3840px]:p-8
          "
        >
          <NavLink
            to="/"
            onClick={() => setIsOpen(false)}
            className="
              flex
              w-full
              items-center
              justify-center

              gap-2

              rounded-lg

              border
              border-white/20

              px-4
              py-2.5

              text-sm
              font-medium

              transition-colors

              hover:border-[#8E1A32]
              hover:bg-[#8E1A32]

              min-[3840px]:py-5
              min-[3840px]:text-xl
            "
          >
            <LogoutIcon className="h-5 w-5" />

            <span>
              Cerrar
            </span>
          </NavLink>
        </div>
      </aside>
    </>
  );
}