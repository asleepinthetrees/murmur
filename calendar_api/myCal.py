from ics import Calendar, Event
from icalevents.icalevents import events
from dateutil.tz import tzlocal

import datetime


class MyCalendar:
    """Calendar Module for Youps."""

    def __init__(self, name, link):
        """Create a new YoupsCalendar instance.

        Parameters:
        name (String) -- the name of the character
        link (String) -- public ics link to the calendar

        """
        self.name = name
        self.link = link

    def get_conflicts(self, startTime, endTime=None,
                      defaultInterval=datetime.timedelta(hours=1)):
        """Check the calendar to see if the specified time is available.

        Parameters:
        startTime (datetime) -- start of the time interval
        endTime (datetime) -- end of the time interval

        Returns:
        list: events conflicting with the interval

        """
        if endTime is None:
            endTime = startTime + defaultInterval
        conflicts = events(self.link, start=startTime, end=endTime)
        return conflicts

    def create_event(self, name, startTime, endTime=None, description="",
                     location="", path=""):
        """Create an ics file containing a new event.

        Parameters:
        name (String) -- name of the event
        startTime (String) -- starting time of the event
        endTime (String) -- ending time of the event (default None
        description (String) -- description for the event (default '')
        location (String) -- location for the event (default '')

        Returns:
        String: path and name of the file the event is stored in

        """
        # NOTE(dzhang98): create a new calendar because using the current
        # calendar would have all the current events
        newCalendar = Calendar()
        newEvent = Event()

        newEvent.name = name
        newEvent.begin = startTime

        if endTime is not None:
            newEvent.end = endTime

        newEvent.description = description
        newEvent.location = location

        newCalendar.events.add(newEvent)

        # TODO: decide file path to store .ics files
        # TODO: decide name format that is human friendly and unique
        # Currently - event name + current time + '.ics'
        timestamp = datetime.datetime.now()
        filename = "%s%s-%s.ics" % (path, name, str(timestamp))
        # for event in newCalendar.events:
        #     print(event)
        with open(filename, 'w') as f:
            f.writelines(newCalendar)

        return filename


if __name__ == "__main__":
    link = "https://calendar.google.com/calendar/ical/3ffpub8evedp0rkgvnubs5s3qk%40group.calendar.google.com/private-4250a5c9223e2fdeb9b64397e3944922/basic.ics"
    cal = MyCalendar("My Classes", link)

    noConflicts = cal.get_conflicts(
                            datetime.datetime(2019, 3, 18, hour=6, minute=30),
                            datetime.datetime(2019, 3, 18, hour=7, minute=30))
    assert len(noConflicts) == 0
    print("noConflicts ==", [conflict.summary for conflict in noConflicts])

    conflicts = cal.get_conflicts(
                            datetime.datetime(2019, 3, 18, hour=10, minute=30),
                            datetime.datetime(2019, 3, 18, hour=11, minute=30))
    assert len(conflicts) == 2
    print("conflicts ==", [conflict.summary for conflict in conflicts])

    # Test event
    tz = tzlocal()

    name = cal.create_event(
                        "Available",
                        datetime.datetime(2019, 3, 4, hour=14, minute=0, tzinfo=tz),
                        datetime.datetime(2019, 3, 4, hour=15, minute=0, tzinfo=tz))
    print("Event Created - " + name)

    name = cal.create_event(
                        "Unavailable",
                        datetime.datetime(2019, 3, 4, hour=12, minute=0, tzinfo=tz),
                        datetime.datetime(2019, 3, 4, hour=13, minute=0, tzinfo=tz))
    print("Event Created - " + name)
