import addCourse from '@pages/background/lib/addCourse';
import createSchedule from '@pages/background/lib/createSchedule';
import type { CalendarTabMessages } from '@shared/messages/CalendarMessages';
import type { Course } from '@shared/types/Course';
import { checkLoginStatus } from '@shared/util/checkLoginStatus';
import CalendarBottomBar from '@views/components/calendar/CalendarBottomBar';
import CalendarGrid from '@views/components/calendar/CalendarGrid';
import { CalendarSchedules } from '@views/components/calendar/CalendarSchedules';
import CalendarHeader from '@views/components/calendar/CalenderHeader';
import ImportantLinks from '@views/components/calendar/ImportantLinks';
import { Button } from '@views/components/common/Button';
import Divider from '@views/components/common/Divider';
import Text from '@views/components/common/Text/Text';
import CourseCatalogInjectedPopup from '@views/components/injected/CourseCatalogInjectedPopup/CourseCatalogInjectedPopup';
import { CalendarContext } from '@views/contexts/CalendarContext';
import useCourseFromUrl from '@views/hooks/useCourseFromUrl';
import { useFlattenedCourseSchedule } from '@views/hooks/useFlattenedCourseSchedule';
import { switchSchedule } from '@views/hooks/useSchedules';
import { CourseCatalogScraper } from '@views/lib/CourseCatalogScraper';
import { courseMigration } from '@views/lib/courseMigration';
import getCourseTableRows from '@views/lib/getCourseTableRows';
import { SiteSupport } from '@views/lib/getSiteSupport';
import { MessageListener } from 'chrome-extension-toolkit';
import React, { useEffect, useState } from 'react';

import CalendarFooter from './CalendarFooter';
import TeamLinks from './TeamLinks';

const getUTRPv1Courses = async (): Promise<string[]> => {
    const { savedCourses } = await chrome.storage.sync.get('savedCourses');
    console.log(savedCourses);

    // Check if the savedCourses array is empty
    if (savedCourses.length === 0) {
        console.log('No courses found');
        prompt('No courses found');
        return [];
    }

    // Extract the link property from each course object and return it as an array
    return savedCourses.map((course: { link: string }) => course.link);
};

/**
 * Calendar page component
 */
export default function Calendar(): JSX.Element {
    const { courseCells, activeSchedule } = useFlattenedCourseSchedule();

    const [course, setCourse] = useState<Course | null>(useCourseFromUrl());

    const [showPopup, setShowPopup] = useState<boolean>(course !== null);
    const [showSidebar, setShowSidebar] = useState<boolean>(true);

    useEffect(() => {
        const listener = new MessageListener<CalendarTabMessages>({
            async openCoursePopup({ data, sendResponse }) {
                const course = activeSchedule.courses.find(course => course.uniqueId === data.uniqueId);
                if (course === undefined) return;

                setCourse(course);
                setShowPopup(true);

                const currentTab = await chrome.tabs.getCurrent();
                if (currentTab === undefined) return;
                sendResponse(currentTab);
            },
        });

        listener.listen();

        return () => listener.unlisten();
    }, [activeSchedule]);

    useEffect(() => {
        if (course) setShowPopup(true);
    }, [course]);

    const handleOnClick = async () => {
        // const link = 'https://utdirect.utexas.edu/apps/registrar/course_schedule/20239/52625/';
        // TODO: Use a proper modal instead of a prompt
        // eslint-disable-next-line no-alert
        const link: string | null = prompt('Enter course link');

        // Exit if the user cancels the prompt
        if (link === null) return;

        const response = await fetch(link);
        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');

        const scraper = new CourseCatalogScraper(SiteSupport.COURSE_CATALOG_DETAILS, doc, link);
        const tableRows = getCourseTableRows(doc);
        const courses = scraper.scrape(tableRows, false);

        if (courses.length === 1) {
            const description = scraper.getDescription(doc);
            const row = courses[0]!;
            const course = row.course!;
            course.description = description;
            // console.log(course);

            if (activeSchedule.courses.every(c => c.uniqueId !== course.uniqueId)) {
                console.log('adding course');
                addCourse(activeSchedule.id, course);
            } else {
                console.log('course already exists');
            }
        } else {
            console.log(courses);
        }
    };

    return (
        <CalendarContext.Provider value>
            <div className='h-full w-full flex flex-col'>
                <CalendarHeader
                    onSidebarToggle={() => {
                        setShowSidebar(!showSidebar);
                    }}
                />
                <div className='h-full flex overflow-auto pl-3'>
                    {showSidebar && (
                        <div className='h-full flex flex-none flex-col justify-between pb-5 screenshot:hidden'>
                            <div className='mb-3 h-full w-fit flex flex-col overflow-auto pb-2 pl-4.5 pr-4 pt-5'>
                                <CalendarSchedules />
                                <Divider orientation='horizontal' size='100%' className='my-5' />
                                <ImportantLinks />
                                <Divider orientation='horizontal' size='100%' className='my-5' />
                                <TeamLinks />
                                <Divider orientation='horizontal' size='100%' className='my-5' />
                                <div className='space-y-5'>
                                    <Text variant='h3'>UTRP v2 Migration Utils</Text>
                                    <Button variant='filled' color='ut-black' onClick={handleOnClick}>
                                        Add course by link
                                    </Button>
                                    <Button
                                        variant='filled'
                                        color='ut-burntorange'
                                        onClick={async () => {
                                            const loggedInToUT = await checkLoginStatus(
                                                'https://utdirect.utexas.edu/apps/registrar/course_schedule/20252/'
                                            );

                                            if (!loggedInToUT) {
                                                console.log('Not logged in to UT');

                                                // Return for now, retry functionality will be added later
                                                return;
                                            }

                                            const courses: string[] = await getUTRPv1Courses();
                                            console.log(courses);

                                            await createSchedule('UTRP v1 Migration');
                                            console.log('Created UTRP v1 migration schedule');
                                            await switchSchedule('UTRP v1 Migration');
                                            console.log('Switched to UTRP v1 migration schedule');

                                            // BUG: activeSchedule is not updated after switching to the new schedule
                                            courseMigration(activeSchedule, courses);
                                            console.log('Successfully migrated UTRP v1 courses');
                                        }}
                                    >
                                        Migrate UTRP v1 courses
                                    </Button>
                                </div>
                            </div>
                            <CalendarFooter />
                        </div>
                    )}
                    <div className='h-full min-w-5xl flex flex-grow flex-col overflow-y-auto'>
                        <div className='min-h-2xl flex-grow overflow-auto pl-2 pr-4 pt-6 screenshot:min-h-xl'>
                            <CalendarGrid courseCells={courseCells} setCourse={setCourse} />
                        </div>
                        <CalendarBottomBar courseCells={courseCells} setCourse={setCourse} />
                    </div>
                </div>

                <CourseCatalogInjectedPopup
                    // Ideally let's not use ! here, but it's fine since we know course is always defined when showPopup is true
                    // Let's try to refactor this
                    course={course!} // always defined when showPopup is true
                    onClose={() => setShowPopup(false)}
                    open={showPopup}
                    afterLeave={() => setCourse(null)}
                />
            </div>
        </CalendarContext.Provider>
    );
}
