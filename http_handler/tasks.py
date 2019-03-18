import logging

import ujson
from browser.imap import authenticate
from browser.models.mailbox import MailBox
from celery.decorators import task, periodic_task
from http_handler.settings import BASE_URL
from schema.youps import Action, ImapAccount, PeriodicTask, TaskScheduler, FolderSchema
from smtp_handler.utils import codeobject_loads, send_email
from datetime import timedelta
import typing as t  # noqa: F401 ignore unused we use it for typing
import imaplib
from imapclient import IMAPClient  # noqa: F401 ignore unused we use it for typing


logger = logging.getLogger('youps')  # type: logging.Logger


@task(name="add_periodic_task")
def add_periodic_task(interval, action_id, expires=None):
    """ create a new dynamic periodic task, mainly used for users' set_interval() call.

    Args:
        interval (number): interval of how often to run the code in sec
        the rest args are same as imap.interpret's
    """
    logger.info("ADD TASK performed!")

    code = 'a=Action.objects.get(id=%d)\ncode_object=codeobject_loads(a.code)\ng = type(codeobject_loads)(code_object ,locals())\ng()' % action_id
    args = ujson.dumps( [imap_account_id, code, search_criteria, folder_name] )

    # TODO naming meaningful to distinguish one-off and interval running
    

    imap_account = ImapAccount.objects.get(id=imap_account_id)
    if expires:  # set_timeout
        imap_account.status_msg = imap_account.status_msg + "[%s]set_timeout(): will be executed after %d seconds\n" % (ptask_name, interval)
    else:
        imap_account.status_msg = imap_account.status_msg + "[%s]set_interval(): executing every %d seconds\n" % (ptask_name, interval)
    imap_account.save()


@task(name="remove_periodic_task")
def remove_periodic_task(imap_account_id, ptask_name=None):
    """ remove a new periodic task. If ptask_name is given, then remove that specific task.
    Otherwise remove all tasks that are associated with the IMAP account ID.

    Args:
        imap_account_id (number): id of associated ImapAccount object
        ptask_name (string): a name of the specific task to be deleted
    """

    if ptask_name is None:
        ptask_prefix = '%d_' % imap_account_id
        PeriodicTask.objects.filter(name__startswith=ptask_prefix).delete()
        Action.objects.filter(folder__imap_account__id=imap_account_id).delete()

    else:
        PeriodicTask.objects.filter(name=ptask_name).delete()

    imap_account = ImapAccount.objects.get(id=imap_account_id)
    status_msgs = imap_account.status_msg.split('\n')

    # update status msg for the user
    new_msg = "".join([ x+"\n" for x in status_msgs if len(x.strip()) > 0 and not x.startswith( "[%d" % (imap_account_id) )])
    imap_account.status_msg = new_msg
    imap_account.save()

@task(name="run_interpret")
def run_interpret(imap_account_id, code, search_criteria, folder_name=None, is_test=False, email_content=None):
    """ execute the given code object.

    Args:
        imap_account_id (number): id of associated ImapAccount object
        code (code object or string): which code to run
        search_criteria (string): IMAP query. To which email to run the code
        is_test (boolean): True- just printing the log. False- executing the code
        email_content (string): for email shortcut --> potential deprecate
    """
    logger.info("Task run interpret imap_account: %d %s" % (imap_account_id, folder_name))
    try: 
        if type(code) == str:
            code = codeobject_loads(code)

        # code = marshal.loads(code)
        from browser.imap import interpret, authenticate
        imap_account = ImapAccount.objects.get(id=imap_account_id)
        auth_res = authenticate( imap_account )
        # TODO auth handling
        if not auth_res['status']:
            raise ValueError('Something went wrong during authentication. Refresh and try again!')
            
        imap = auth_res['imap']
        if folder_name is None: 
            imap.select_folder('INBOX')
        else:
            imap.select_folder(folder_name)
        res = interpret(imap_account, imap, code, search_criteria, is_test, email_content)

        logger.info(res['imap_log'])

        # @Luke
        # TODO add logs to users' execution_log
        # we need a setter function that is dealing with text encoding. Every log should be added through the function. 
        # save_exeucution_log(imap_account, res['imap_log'])
    except ImapAccount.DoesNotExist:
        logger.exception("Remove periodic tasks fails ImapAccount object not exist. imap account id %s" % (imap_account_id))
    except Exception as e:
        logger.exception("Remove periodic tasks fails imap account id %s > %s" % (imap_account.email, e))


# @periodic_task(run_every=(crontab(minute='*/15')), name="some_task", ignore_result=True)
# def some_task():
#     # do something
#     logger.info("Saved image from Flickr")
#     print ("perioid task") 

@task(name="register_inbox")
def register_inbox(imapAccount_email):
    """ execute the given code object.

    Args:
        imapAccount_email (string):  
    """
    try:
        logger.info('first syncing..: %s', imapAccount_email)
        imapAccount = ImapAccount.objects.get(email=imapAccount_email)
        while True:
            # try to perform a sync
            try:
                # authenticate with the user's imap server
                auth_res = authenticate(imapAccount)
                # if authentication failed we can't run anything
                if not auth_res['status']:
                    # Stop doing loop
                    # TODO maybe we should email the user
                    return

                # get an imapclient which is authenticated
                imap = auth_res['imap']  # type: IMAPClient

                # create the mailbox
                mailbox = MailBox(imapAccount, imap)
                # sync the mailbox with imap
                done = mailbox._sync()

                # if we are done break out of the loop
                if done:
                    break
            # if there is an EOF error logout and try again
            except imaplib.IMAP4.abort:
                logger.exception("Imap lib failure while syncing")
                try:
                    imap.logout()
                except Exception:
                    logger.exception("Failure while logging out")
                    continue
                continue
            # if there is any other Exception log and fail so we don't repeat forever
            except Exception:
                logger.critical("Failed while initially syncing")
                raise
  
        logger.info("Mailbox sync done: %s" % (imapAccount_email))
        
        # after sync, logout to prevent multi-connection issue
        imap.logout()

        folders = FolderSchema.objects.filter(imap_account = imapAccount)  # type: t.Iterable[FolderSchema]
        # if any folder is not initialized
        if any((not f.is_initialized for f in folders)):
            remaining_folders = filter(lambda f: not f.is_initialized, folders)
            logger.info("Still initializing folders %s" % (','.join([f.name for f in remaining_folders])))

            # register the task to occur again
            register_inbox.apply_async(args=[imapAccount.email], queue='new_user', routing_key='new_user.import')
            return

        imapAccount.is_initialized = True
        imapAccount.save()
        send_email("Your YoUPS account is ready!", "no-reply@" + BASE_URL, imapAccount.email, "Start writing your automation rule here! " + BASE_URL)

        logger.info(
            'Register done for %s', imapAccount_email)
    except ImapAccount.DoesNotExist:
        imapAccount.is_initialized = False
        imapAccount.save()
        logger.exception("syncing fails Remove periodic tasks. imap_account not exist %s" % (imapAccount_email))

    except Exception as e:
        logger.exception("User inbox syncing fails %s. Stop syncing %s" % (imapAccount_email, e))     


@task(name="loop_sync_user_inbox")
def loop_sync_user_inbox():
    logger.info('Loop sync start..')
    imapAccounts = ImapAccount.objects.filter(is_initialized=True)  # type: t.List[ImapAccount]
    for imapAccount in imapAccounts:
        imapAccount_email = imapAccount.email

        try:
            logger.info('Start syncing %s ', imapAccount_email)

            # authenticate with the user's imap server
            auth_res = authenticate(imapAccount)
            # if authentication failed we can't run anything
            if not auth_res['status']:
                # Stop doing loop
                # TODO maybe we should email the user
                return

            # get an imapclient which is authenticated
            imap = auth_res['imap']

            # create the mailbox
            try:
                mailbox = MailBox(imapAccount, imap)
                # sync the mailbox with imap
                mailbox._sync()
            except Exception:
                logger.exception("Mailbox sync failed")
                # TODO maybe we should email the user
                continue
            logger.debug("Mailbox sync done: %s" % (imapAccount_email))

            try:
                res = mailbox._run_user_code()
            except Exception():
                logger.exception("Mailbox run user code failed")

            if res is not None and res.get('imap_log', ''):
                imapAccount.execution_log = "%s\n%s" % (res['imap_log'], imapAccount.execution_log) 
                imapAccount.save()

            # after sync, logout to prevent multi-connection issue
            imap.logout()

            logger.info(
                'Sync done for %s', imapAccount_email)
        except ImapAccount.DoesNotExist:
            imapAccount.is_initialized = False
            imapAccount.save()
            logger.exception("syncing fails Remove periodic tasks. imap_account not exist %s" % (imapAccount_email))

        except Exception as e:
            logger.exception("User inbox syncing fails %s. Stop syncing %s" % (imapAccount_email, e)) 