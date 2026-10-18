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
} from "@/components/ui/sidebar";
import {BrandLogo} from "@/components/common/brand-logo";
import {NavUser} from "@/components/nav-user";
import {Separator} from "@/components/ui/separator";
import {isNavItemActive, NAV_SECTIONS} from "@/lib/sidebar-nav";

export function AppSidebar(): JSX.Element {
    const {pathname} = useLocation();

    return (
        <Sidebar>
            <SidebarHeader>
                <div className="px-2 py-2">
                    <h1><BrandLogo className="h-7 w-auto"/></h1>
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
                                            <SidebarMenuButton asChild isActive={active}>
                                                <Link to={item.to} aria-current={active ? "page" : undefined}>
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
                <NavUser/>
            </SidebarFooter>
        </Sidebar>
    );
}
