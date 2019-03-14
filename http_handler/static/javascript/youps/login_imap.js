$(document).ready(function() {
    
    var user_name = $.trim($('#user_email').text()),
        btn_login = $("#btn-login"),
        btn_test_run = $("#btn-test-run"),
        btn_code_sumbit = $("#btn-code-submit"),
        btn_incoming_save = $("#btn-incoming-save"),
        btn_shortcut_save = $("#btn-shortcut-save");

    var log_backup = "", user_status_backup = "";

    // Format string
    if (!String.prototype.format) {
        String.prototype.format = function() {
          var args = arguments;
          return this.replace(/{(\d+)}/g, function(match, number) { 
            return typeof args[number] != 'undefined'
              ? args[number]
              : match
            ;
          });
        };
      }

    function append_log( log, is_error ) {
        if(!log) return;

        var datetime = format_date();

        if(is_error) 
            $( "<p>" + datetime + log.replace(/\n/g , "<br>") + "</p>" ).prependTo( "#console-output" ).addClass("error");

        else $( "<p>" + datetime + log.replace(/\n/g , "<br>") + "</p>" ).prependTo( "#console-output" )
            .addClass("info");
    }   

    function create_new_tab(nav_bar) {
        var id = $("#editor-container .tab-pane").length; // avoid same ID
        // Add tab
        $(nav_bar).closest('li').before('<li><a href="#tab_{0}"><span class="tab-title" mode-id={0}>On meeting</span><i class="fas fa-pencil-alt"></i></a> <span class="close"> x </span></li>'.format(id));

        // Move to the newly added tab
        $('.nav-tabs li:nth-child(' + ($('.nav-tabs li').length-1) + ') a').click();

        // Add tab-pane
        var tab_pane_content = `<div class='tab-pane row' id='tab_{0}'> 
            <div class='editable-new-message-container'></div>
            <div class='editable-repeat-container'></div>

            <!-- add a new message editor button -->
            {1}
            <!-- add a new repeat editor button -->
            {2}
        </div>`.format(id, get_panel_elem("new-message", false), get_panel_elem("repeat", false));
        $('.tab-content').append( tab_pane_content );

        unsaved_tabs.push( id );
    }

    function append_status_msg( msg, is_error ) {
        if(!msg) return;

        $.each( msg.split("\n"), function( key, value ) {
            value = $.trim(value);
            if(value == "") return;
            
            $( "<p>" + 
            '<span class="fa-layers fa-fw fa-2x"><i class="fas fa-sync"></i><span class="fa-layers-counter idle-mark" style="background:Tomato">IDLE</span></span>'
            + value.replace(/ *\[[^\]]*]/, '') + "</p>" ).prependTo( "#user-status-msg" )
            .addClass("info");

            spinStatusCog(true);
        });
        
    }

    function format_date() {
        var currentdate = new Date();
        var datetime = (currentdate.getMonth()+1) + "/"
            + currentdate.getDate() + "/" 
            + currentdate.getFullYear() + " @ "  
            + currentdate.getHours() + ":"  
            + currentdate.getMinutes() + ":" 
            + currentdate.getSeconds()
            + " | ";

        return datetime;
    }

    function init_editor(editor_elem) {
        var editor = CodeMirror.fromTextArea(editor_elem, {
            mode: {name: "python",
                version: 3,
                singleLineStringErrors: false},
            lineNumbers: true,
            indentUnit: 4,
            matchBrackets: true
        });

        var arrows = [13, 27, 37, 38, 39, 40];
        editor.on("keyup", function(cm, e) {
          if (arrows.indexOf(e.keyCode) < 0) {
            editor.execCommand("autocomplete")
          }
        })

        editor.getValue( "import re, spacy, datetime, arrow" );
        editor.markText({line:0,ch:0},{line:2,ch:1},{readOnly:true});
    }

    function init_folder_selector($folder_container) {
        // nested tree checkboxs http://jsfiddle.net/rn290ywf/
        // TODO just for test
        if (FOLDERS.length ==0)
            FOLDERS = ['INBOX', 'Family','Family/Sub folder1','Family/Sub folder2', 'Conference', 'Internship', 'Budget']
        
        // Init a new folder list

        // create folder nested structures
        folders_nested = {}
        $.each(FOLDERS, function(index, value) {
            if(value.includes("/")) {
                pwd = value.split("/")
                d = folders_nested
                $.each(pwd, function(i, v) {
                    if(v in d) {}
                    else { d[v] = {}
                    }
                    d = d[v]
                })
                folders_nested = $.extend(folders_nested,d)
            } else { 
                if( (value in folders_nested) == false)  
                    folders_nested[value]= {} 
                }        
        })

        function isDict(v) {
            return typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date);
        }

        // dict => <ul><li>key1 <ul><li>key1-1</li></ul></li> <li>key2</li></ul>
        function rec_add_nested(d, path) {
            var $ul = $("<ul></ul>");
            for (var key in d) {
                var p = "";
                if (path=="") p = key;
                else  p = path + "/" + key;
                var $li = $("<li><input type='checkbox' value='"+ p + "'>" + '<i class="far fa-folder-open"></i> ' + key + "</li>");
                
                if( Object.keys(d[key]).length > 0 ) { $li.append(rec_add_nested(d[key], p)) } 

                $ul.append($li);
            }

            return $ul;
        }
        
        u = rec_add_nested(folders_nested, "")
        $folder_container.append(u)
    }

    function get_panel_elem(type, editable) {
        var editor_elem = `<div class="panel-body" style="display:none;">
            <div class="folder-container"></div>
            <div class="editor-container">
            <textarea class="editor mode-editor" id="editor-{0}"></textarea>
        </div>`;

        if(type == "new-message") {
            return `<div class="{0} panel panel-success">
                <div class="panel-heading panel-collapsed">
                    <h3 class="panel-title">
                        <span class="fa-layers fa-fw fa-2x"> 
                                <i class="far fa-envelope"></i>
                                <span class="fa-layers-counter" style="background:Tomato">NEW</span>
                        </span>
                        New message <span class=""></span></h3>
                </div>
                {1}
            </div>`.format(editable ? "": "btn-new-editor", 
                editable ? editor_elem : "");
        } else if (type == "repeat") {
            return `<div class="{0} panel panel-warning">
                <div class="panel-heading panel-collapsed">
                    <h3 class="panel-title">
                        <i class="far fa-2x fa-clock"></i> Update every <span class=""></span>
                    </h3>
                </div>
                {1}
            </div>`.format(editable ? "": "btn-new-editor",
                editable ? editor_elem : "");
        }
    }

    function guess_host( email_addr ) {
        $("#link-less-secure").attr('href', "");
        $("#rdo-oauth").attr('disabled', "");
        
        if( validateEmail(email_addr) ) {
            $("#password-container").show();
            toggle_login_mode();

            if( email_addr.includes("gmail")) {
                $("#input-host").val("imap.gmail.com");
                $("#link-less-secure").attr('href', "https://myaccount.google.com/lesssecureapps");
                $("#rdo-oauth").removeAttr('disabled');

                $(".oauth").show();
            }
            else {
                $(".oauth").remove();

                $("#rdo-plain").not(':checked').prop("checked", true);
                
                if ( email_addr.includes("yahoo")) $("#input-host").val("imap.mail.yahoo.com");
                else if ( email_addr.includes("csail")) $("#input-host").val("imap.csail.mit.edu");
                else if ( email_addr.includes("mit")) $("#input-host").val("imap.exchange.mit.edu");
                else $("#input-host").val("");

                $(".oauth").hide();
            }
        }
        else $("#password-container").hide();
    }

    // Disable all the buttons for a while until it is sure that the user is authenticated
    $(".btn").prop("disabled",true);
    
    var test_mode_msg = {true: "You are currently at test mode. YoUPS will simulate your rule but not actually run the rule.", 
        false: "YoUPS will apply your rules to your incoming emails. "};

    $("#mode-msg").text( test_mode_msg[is_test] );

    // for demo; set date to now
    $(".current-date").text(format_date());

    // Create the sandbox:
    // window.sandbox = new Sandbox.View({
    //     el : $('#sandbox'),
    //     model : new Sandbox.Model()
    //   });

    // init editor  
    var unsaved_tabs = [];


    /**
     * Event listeners 
     * 
     */
    
    document.addEventListener("mv-load", function(){   
        // Init editor & its autocomplete

        // Open individual tab and panel
        $('.nav-tabs li').each(function() {
            if ( !$(this).find('span') ) return;

            $(this).find('a').click();
            $( $(this).find('a').attr('href') ).find('.panel').each(function() {
                $(this).find('.panel-heading').click();
                if ($(this).find('textarea').length)
                    init_editor( $(this).find('textarea')[0] );
            })
            
        })

        // Init folder container
        init_folder_selector( $(".folder-container") )

        // Load mode - folder selection
        $(".tab-pane").each(function() {
            var mode_id = $(this).attr('id').split("_")[1];
            for(var i=0; i < mode_folder.length ; i++) {
                if(mode_folder[i][1] == mode_id) {
                    $(this).find('.folder-container input[value="'+ mode_folder[i][0] + '"]').prop( "checked", true );
                }
            }
        }) 

        var method_names = [];
        document.querySelectorAll('#apis-container h4').forEach(function(element) {
            method_names.push( element.innerHTML.split("(")[0] );
        });

        CodeMirror.registerHelper('hint', 'dictionaryHint', function(editor) {
            var cur = editor.getCursor();
            var curLine = editor.getLine(cur.line);
            var start = cur.ch;
            var end = start;

            while (end < curLine.length && /[\w$]/.test(curLine.charAt(end))) ++end;
            while (start && /[\w$]/.test(curLine.charAt(start - 1))) --start;
            var curWord = start !== end && curLine.slice(start, end);
            var regex = new RegExp('^' + curWord, 'i');

            var suggestion = method_names.filter(function(item) {
                return item.match(regex);
            }).sort();
            suggestion.length == 1 ? suggestion.push(" ") : console.log();

            return {
                list: suggestion,
                from: CodeMirror.Pos(cur.line, start),
                to: CodeMirror.Pos(cur.line, end)
            }
        });

        CodeMirror.commands.autocomplete = function(cm) {
            CodeMirror.showHint(cm, CodeMirror.hint.dictionaryHint);
        };

        // Hide body until editor is ready
        setTimeout(() => {
            $('#loading-wall').hide();
            show_loader(false);
        }, 500);
    });
    
    // Switch to different tabs
    $(".nav-tabs").on("click", "a", function (e) {
        e.preventDefault();
        if (!$(this).hasClass('add-tab')) {
            $(this).tab('show');
            // TODO change to value of mode dropdown
        }
    })
    .on("click", "span.close", function () { // delete tab/mode
        var anchor = $(this).siblings('a');
        $(anchor.attr('href')).remove();
        $(this).parent().remove();
        $(".nav-tabs li").children('a').first().click();

        var mode_id = $(this).siblings('a').attr('href').split("_")[1];
        if( !unsaved_tabs.includes(mode_id) )
            delete_mode( mode_id );
    });

    $('.add-tab').click(function (e) {
        e.preventDefault();

        create_new_tab(this);
    });

    // add a new editor
    $("#editor-container").on("click", ".btn-new-editor", function() {
        var $container = $( $(this).siblings(".editable-{0}-container".format($(this).attr("type"))) );
        var editor_elem = get_panel_elem($(this).attr("type"), true);
        $container.append( editor_elem );

        init_editor( $container.find('textarea').last()[0] );
        init_folder_selector( $($container.find('.folder-container').last()[0]) );
    });
    
    // Tab name editor
    var editHandler = function() {
      var t = $(this);
      t.css("visibility", "hidden");
      $(this).siblings('.tab-title').attr("contenteditable", "true").focusout(function() {
        $(this).removeAttr("contenteditable").off("focusout");
        t.css("visibility", "visible");
      });
    };
    
    $( "body" ).on( "click", ".nav-tabs .fa-pencil-alt", editHandler);

    // Reload dropdown menu
    $("#current_mode_dropdown").on("click", function() {
        var $ul = $(this).parents(".dropdown").find('.dropdown-menu');
        $ul.empty();

        var modes = get_modes();
        $.each( modes, function( key, value ) {
            $ul.append( '<li><a href="#" data-value="action" mode-id='+ value.id + '>' + value.name + '</a></li>' );
        });
    });

    $("body").on("click", ".dropdown li a", function() {
        $(this).parents(".dropdown").find('.btn').html($(this).text() + ' <span class="caret"></span>');
        $(this).parents(".dropdown").find('.btn').attr('mode-id', $(this).attr('mode-id'));
        $(this).parents(".dropdown").find('.btn').val($(this).data('value'));

        // update current_mode
        run_code( $('#test-mode[type=checkbox]').is(":checked"), get_running());
    })

    $.extend($.expr[':'], {
        unchecked: function (obj) {
            return ((obj.type == 'checkbox' || obj.type == 'radio') && !$(obj).is(':checked'));
        }
    });

    $('#editor-container').on('change', '.folder-container input:checkbox', function() {
        // change children's value
        $(this).siblings('ul').find('input:checkbox').prop('checked', $(this).prop("checked"));

        for (var i = $('.folder-container').find('ul').length - 1; i >= 0; i--) {
            // find parents value
            $('.folder-container').find('ul:eq(' + i + ')').parents('li').find('> input').prop('checked', function () {
                return $(this).siblings('ul').find('input:unchecked').length === 0 ? true : false;
            });
        }
    });

    // Accordion listener
    $("#editor-container").on("click", ".panel-heading", function (e) {
        e.preventDefault();

        var $this = $(this);
        if(!$this.hasClass('panel-collapsed')) { // close the panel
            $this.parents('.panel').find('.panel-body').slideUp();
            $this.addClass('panel-collapsed');
            $this.find('.fa-chevron-down').hide();
            $this.find('.fa-chevron-up').show();
            $this.find(".preview-namespace").show();
        } else { // open the panel
            $this.parents('.panel').find('.panel-body').slideDown();
            $this.removeClass('panel-collapsed');
            $this.find('.fa-chevron-up').hide();
            $this.find('.fa-chevron-down').show();
            $this.find(".preview-namespace").hide();
        }
    })

    // $("#password-container").hide();
    guess_host($("#user-full-email").text());
    toggle_login_mode();

    if(is_imap_authenticated) {
        fetch_log(); 

        $(".btn").prop("disabled",false);

        // set dropdown to current mode name if exist
        if(current_mode) {
            $(".dropdown .btn").html(current_mode + ' <span class="caret"></span>');
            $(".dropdown .btn").attr('mode-id', current_mode_id);
        }

        else {
            // init $("#current_mode_dropdown") with a default value if there is no selected mode yet
            var random_id = document.querySelector('.nav.nav-tabs li.active .tab-title').getAttribute('mode-id'),
            random_mode_name = $.trim( document.querySelector('.nav.nav-tabs span[mode-id="'+ random_id + '"]').innerHTML );

            $(".dropdown .btn").html(random_mode_name + ' <span class="caret"></span>');
            $(".dropdown .btn").attr('mode-id', random_id);
        }
    }
    
	$('input[type=radio][name=auth-mode]').change(function() {
        toggle_login_mode();      
    });

    $("#test-mode[type=checkbox]").switchButton({
        labels_placement: "right",
        on_label: 'Test mode',
        off_label: '',
        checked: is_test
    });

    btn_code_sumbit.click(function() {
        if( get_running() ) { // if currently running, then stop 
            run_code( $('#test-mode[type=checkbox]').is(":checked"), false );
        } else run_code( $('#test-mode[type=checkbox]').is(":checked"), true );
        
    });

    btn_incoming_save.click(function() {
        run_code( $('#test-mode[type=checkbox]').is(":checked"), get_running() ); 
    });

    btn_shortcut_save.click(function() {
        save_shortcut();
    })

    $('#test-mode[type=checkbox]').change(function() {
        var want_test = $(this).is(":checked");
        $("#mode-msg").text( test_mode_msg[ want_test ] );
        if(get_running())
            run_code( want_test, true ); 
    });

    function delete_mode( id_to_delete ) {
        var params = {
            'id': id_to_delete
        };

        $.post('/delete_mailbot_mode', params,
            function(res) {
                // $('#donotsend-msg').hide();
                console.log(res);
                
                // Delete success
                if (res.status) {
                    if( id_to_delete == get_current_mode()['id'] ) {
                        set_running(false);
                        $(".dropdown .btn").html("Select your mode" + ' <span class="caret"></span>');
                    }
                        
                }
                else {
                    notify(res, false);
                }
            }
        );
    }

    function show_loader( is_show ) {
        if(is_show) $(".sk-circle").show();
        else $(".sk-circle").hide();
    }
	
	function toggle_login_mode() {
		oauth = $('#rdo-oauth').is(":checked");
		if (oauth) {
            $(".oauth").show();
            $(".plain").hide();
		} else {
			$(".oauth").hide();
            $(".plain").show();
		}
    }

    function get_current_mode() {
        var id = $("#current_mode_dropdown").attr('mode-id'),
            code = document.querySelector('#tab_'+ id +' .CodeMirror').CodeMirror.getValue();

        return {"id": id,
            "name": $.trim(document.querySelector('.nav.nav-tabs li.active .tab-title').innerHTML), 
            "code": code
        };
    }

    function get_modes() {
        var modes = {};

        document.querySelectorAll('.tab-content .CodeMirror').forEach(function(element) { 
            var id = $(element).parents('.tab-pane').attr('id').split("_")[1];
            code = element.CodeMirror.getValue(),
            name = document.querySelector(".nav.nav-tabs span[mode-id='{0}']".format(id)).innerHTML,
            selected_folders = [];

            $(element).parents('.tab-pane').find(".folder-container input:checked").each(function () {
                selected_folders.push($(this).attr('value'));
            });
            

            modes[id] = {
                "id": id,
                "name": $.trim( name ), 
                "code": code,
                "folders": selected_folders
            };
        });

        return modes;
    }

    function get_running() {
        return is_running;
    }

    function set_running(start_running) {
        // Start running
        if(start_running) {
            spinStatusCog(true);
            $("#engine-status-msg").text("Your email engine is running.");
            btn_code_sumbit.text("STOP");
            is_running = true;
        }
        
        // Stop running
        else {
            spinStatusCog(false);
            $("#engine-status-msg").text("Your email engine is not running at the moment.");
            btn_code_sumbit.text("Apply");
            is_running = false;
        }
    }
    
    function spinStatusCog(spin) {
        if(spin) {
            if( fa_sync = document.querySelector(".fa-sync"))
                fa_sync.classList.add("fa-spin");
            if( idle_mark = document.querySelector(".idle-mark"))
                idle_mark.style.display = "none";
        }
        else {
            if( fa_sync = document.querySelector(".fa-sync"))
                fa_sync.classList.remove("fa-spin");
            if( idle_mark = document.querySelector(".idle-mark"))   
                idle_mark.style.display = "inline-block";
        }
    }

    function fetch_log() {
        var params = {};
        
        $.post('/fetch_execution_log', params,
            function(res) {
                // $('#donotsend-msg').hide();
                // console.log(res);
                
                // Auth success
                if (res.status) {
                    // Update execution log
                    if( log_backup != res['imap_log']){
                        $("#console-output").html("");
                        append_log(res['imap_log'], false);
                    }
                    
                    log_backup = res['imap_log'];

                    // if status_msg exists, it means a code is running 
                    if( $.trim( res['user_status_msg'] ) != "")
                        set_running(true)
                    else set_running(false)

                    // Update status msg
                    if( user_status_backup != res['user_status_msg']){
                        $("#user-status-msg").html("");
                        append_status_msg(res['user_status_msg'], false);
                    }
                    
                    user_status_backup = res['user_status_msg'];
                }
                else {
                    notify(res, false);
                }
            }
        );
        
        setTimeout(fetch_log, 2 * 1000); // 2 second
    }

    function validateEmail(email) {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    }    

        // When user first try to login to their imap. 
        btn_login.click(function() {
                show_loader(true);

                var params = {
                    'host': $("#input-host").val(),
                    'password': $('#rdo-oauth').is(":checked") ? $("#input-access-code").val() : $("#input-password").val(),
                    'is_oauth': $('#rdo-oauth').is(":checked")
                };
        
                $.post('/login_imap', params,
                    function(res) {
                        show_loader(false);
                        // $('#donotsend-msg').hide();
                        console.log(res);
                        
                        // Auth success
                        if (res.status) {
                            // Show coding interfaces 
                            $("#login-email-form").hide();
                            $(".btn").prop("disabled",false);

                            if ('imap_code' in res) {
                                editor.setValue( res['imap_code'] );
                                spinStatusCog(true);
                            }
                            
                            append_log(res['imap_log'], false)
                            
                            if (res.code) { 
                            }
                            else {                        
                                notify(res, true);
                            }

                            // then ask user to wait until YoUPS intialize their inbox
                            show_loader(true);
                            $("#loading-wall").show();
                            $("#loading-wall span").show();
                        }
                        else {
                            notify(res, false);
                        }
                    }
                ).fail(function(res) {
                    alert("Fail to load! Can you try using a different browser? 403");
                });    
        });

        function run_code(is_dry_run, is_running) {
            show_loader(true);

            var cur_mode = get_current_mode();

            var modes = get_modes();

            var params = {
                'current_mode_id': cur_mode['id'],
                'modes': JSON.stringify(modes),
                'email': $("#input-email").val(),
                'test_run': is_dry_run,
                'run_request': is_running
            };

            $.post('/run_mailbot', params,
                function(res) {
                    show_loader(false);
                    console.log(res);
                    
                    // Auth success
                    if (res.status) {
                        
                        // Flush unsaved tags 
                        unsaved_tabs = [];

                        if(res['imap_error'])  {
                            append_log(res['imap_log'], true);

                            set_running(false);   
                        }
                        else {
                            append_log(res['imap_log'], false)

                            set_running(is_running);   
                        }

                        if (res.code) { 
                            // some emails are not added since they are not members of the group
                            // $('#donotsend-msg').show();
                            // $('#donotsend-msg').html(res['code']);
                        }
                        else {                        
                            notify(res, true);
                        }
                    }
                    else {
                        notify(res, false);
                    }
                }
            );
        }

        function save_shortcut() {
            show_loader(true);

            var params = {
                'shortcuts' : document.querySelector('#editor-shortcut-container .CodeMirror').CodeMirror.getValue()
            };

            $.post('/save_shortcut', params,
                function(res) {
                    show_loader(false);
                    console.log(res);
                    
                    // Auth success
                    if (res.status) {

                        if (res.code) { 
                            // some emails are not added since they are not members of the group
                            // $('#donotsend-msg').show();
                            // $('#donotsend-msg').html(res['code']);
                        }
                        else {                        
                            notify(res, true);
                        }
                    }
                    else {
                        notify(res, false);
                    }
                }
            );
        }
    
        $(".default-text").blur();

        tinyMCE.init({
            mode: "textareas",
            theme: "advanced",
            theme_advanced_buttons1: "bold,italic,underline,strikethrough,|,justifyleft,justifycenter,justifyright,justifyfull,|,blockquote",
            theme_advanced_toolbar_location: "top",
            theme_advanced_toolbar_align: "left",
            theme_advanced_statusbar_location: "bottom",
            theme_advanced_resizing: true
        });
    });
