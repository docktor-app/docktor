import type {JSX} from "react";
import {Link, useLocation} from "react-router";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";
import {BrandLogo} from "@/components/common/brand-logo";
import {NavUser} from "@/components/nav-user";
import {SidebarVersionBlock} from "@/components/sidebar-version-block";
import {Separator} from "@/components/ui/separator";
import {APP_VERSION} from "@/lib/app-version";
import {PROJECT_LINKS} from "@/lib/project-links";
import {isNavItemActive, NAV_SECTIONS} from "@/lib/sidebar-nav";

export function AppSidebar(): JSX.Element {
    const {pathname} = useLocation();
    const {setOpenMobile} = useSidebar();

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <div className="px-2 py-2 group-data-[collapsible=icon]:px-0">
                    <h1>
                        <span className="group-data-[collapsible=icon]:hidden">
                            <BrandLogo className="h-7 w-auto"/>
                        </span>
                        <span className="hidden group-data-[collapsible=icon]:block">
                            <BrandLogo variant="mark" className="size-8"/>
                        </span>
                    </h1>
                </div>
            </SidebarHeader>
            <SidebarContent>
                {NAV_SECTIONS.map((section) => (
                    <SidebarGroup key={section.label}>
                        <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {section.items.map((item) => {
                                    const active = isNavItemActive(pathname, item.to);
                                    return (
                                        <SidebarMenuItem key={item.to}>
                                            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                                                <Link
                                                    to={item.to}
                                                    aria-current={active ? "page" : undefined}
                                                    onClick={() => setOpenMobile(false)}
                                                >
                                                    <item.icon/>
                                                    <span>{item.label}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
            <Separator />
            <SidebarFooter>
                <SidebarVersionBlock version={APP_VERSION} links={PROJECT_LINKS}/>
                <NavUser/>
            </SidebarFooter>
        </Sidebar>
    );
}
