if (typeof(SiebelAppFacade.VHASSJNavigationPR) === "undefined") {
    SiebelJS.Namespace("SiebelAppFacade.VHASSJNavigationPR");
    define("siebel/custom/VHASSJNavigationPR", ["siebel/jqgridrenderer", "siebel/custom/VHASSJValidations"],
        function() {

            window.onerror = function(msg, url, line, col, error) {
                console.error("[VHASSJ ERROR CAUGHT]", msg, error);
                try {
                    safeHideLoader();
                } catch (e) {}
                return false;
            };

            SiebelAppFacade.VHASSJNavigationPR = (function() {

                function VHASSJNavigationPR(pm) {
                    SiebelAppFacade.VHASSJNavigationPR.superclass.constructor.apply(this, arguments);
                }

                SiebelJS.Extend(VHASSJNavigationPR, SiebelAppFacade.JQGridRenderer);
                
                var prevViewName = ""; //11630 juhi
                var currentViewTracked = ""; //11630 juhi

                var currentTask, segment = "";
                var autoNavInProgress;
                var autoNavTargetIndex;
                var listOfActiveStepperNames = [];
                var activeStepperName;
                var activeView = "",
                    activeViewName = "",
                    appletMap;
                var isDFAFlow = "N",
                    quoteNum = "",
                    quoteId = "",
                    isExisting = "N",
                    isStart = "N";
                var steps, currentStepName, currentStepIndex;
                var sEditAppltShow; //VHA KT 040926: Added for CM-10075
                var Options = {},
                    inps = "",
                    outs = ""; //VHA KT 140526: Added for Return to fulfilment
                var retryCount = 0;

                const tasks = {
                    "Connect Postpay": [
                        "Customer details",
                        "ID details",
                        "Credit check",
                        "Billing details",
                        "Coverage check",
                        "Proposition",
                        "Prepayment and sharing",
                        "Order review",
                        "Make a prepayment",
                        "eSIM QR Code"
                    ],
                    "DFA": [
                        "Customer details",
                        "ID details",
                        "Credit check",
                        "Billing details",
                        "Coverage check",
                        "Proposition",
                        "Order review",
                        "Payment"
                    ]
                };

                function safeHideLoader() {
                    $("#ssjLoaderOverlay").css("visibility", "hidden");
                    $("#_swecontent")?.children().not("#ssjLoaderOverlay").css("display", "block");
                }

                function addSpinner() {
                    var html =
                        `<div id="ssjLoaderOverlay">
                        <div class="spinner"></div></div>
                        <div class = "vha-ssj-keyframes"><style>
                        @keyframes spin 
                        { 
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                        }</style></div>`;

                    if ($("#ssjLoaderOverlay").length === 0) {
                        $("#_swecontent").append(html);
                    }
                }

                function changeButtonCaption() {
                    if (activeViewName == "VF New Connect MSO Order Summary View TBUI SSJ - eSIM Details" && (!isDFAFlow)) {
                        var ReqMinPP = Number(sessionStorage.getItem("ReqMinPP"));
                        var overrideFlg = $("input[aria-label='Override SMS']").val();
                        sessionStorage.setItem("overrideFlg", overrideFlg);

                        var $btn = $("button[data-display ='Pick MSISDN']");
                        var isBtnDisable = ($btn.prop("disabled") || $btn.hasClass("appletButtonDis"));
                        sessionStorage.setItem("isBtnDisable", isBtnDisable);

                        if (ReqMinPP > 0) {
                            $(".customNextButton").text("Proceed to Prepayment");
                            $(".ButtonSubmit").hide();
                        } else {
                            $(".customNextButton").hide();
                            if (overrideFlg == "Y")
                                $(".ButtonSubmit .siebui-applet-button span").text("Submit Order");
                            else {
                                if (!(isBtnDisable))
                                    $(".ButtonSubmit .siebui-applet-button span").text("Submit order and send 2 way SMS");
                                else
                                    $(".ButtonSubmit .siebui-applet-button span").text("Submit Order");
                            }

                        }
                        $("input[aria-label='Override SMS']").on('change', function() {
                            changeButtonCaption();
                        });
                    } else if (activeViewName == "VHA SSJ Prepayment Processing View") {
                        $(".customNextButton").hide();
                        var overrideFlg = sessionStorage.getItem("overrideFlg");
                        var isBtnDisable = (sessionStorage.getItem("isBtnDisable") === "true"); //CM-10609 : SSINGHAL

                        if (overrideFlg == "Y")
                            $(".ButtonSubmit .siebui-applet-button span").text("Submit Order");
                        else {
                            if (!(isBtnDisable))
                                $(".ButtonSubmit .siebui-applet-button span").text("Submit order and send 2 way SMS");
                            else
                                $(".ButtonSubmit .siebui-applet-button span").text("Submit Order");
                        }

                    } else if (activeViewName == "VHA DFA Payment View") {
                        $(".ButtonSubmit .siebui-applet-button span").text("Submit order and send 2 way SMS");
                        $(".customNextButton").hide();
                    }
					else if (activeViewName == "VHA eSIM QR Code Details View - SSJ") {
                        $(".Playbarnext .siebui-applet-button button").text("Finish");
                        }
                }

                function validateSharing() {
                    $('.errorMsg').remove();
                    var sharingFlg = sessionStorage.getItem("sharingFlg");
                    if (sharingFlg == "Y") {
                        var setUpEle = $("input[aria-label='Setup sharing group (new/existing)']");
                        var groupEle = $("input[aria-label='Select group']");

                        var setUpFlg = $(setUpEle).val();
                        var group = $(groupEle).val();

                        if (setUpFlg != "Y")
                            $(setUpEle).parent().find("span").after("<p class='errorMsg' style='color:red'>Setup Sharing Group must be ticked if you are creating a new sharing group. Please select Setup Sharing Group or select an existing group if you want to share with an existing group.</p>");
                        else
                            $(setUpEle).parent().find(".errorMsg").remove();

                        if (group == null || group == "" || group == undefined || group == "undefined")
                            $(groupEle).parent().parent().after("<p class='errorMsg' style='color:red'>Sharing Group Name is a mandatory field, please select from the list of suggested names or enter a custom name.</p>");
                        else
                            $(groupEle).parent().parent().nextAll('.errorMsg').first().remove();
                    }
                }

                function doProcessing(currentTask) {
                    try {
                        injectNoRecord();
                        addCustomButton(currentTask);
                        addStepper(currentTask);
                        populateHeadings();
                        additionalChanges();
                        changeButtonCaption();
                        VHAAppUtilities.bindChangeEvent();
                    } catch (e) {
                        safeHideLoader();
                    }
                }

                function backNavigation(targetIndex) {
                    var err = $(".vha-ssj-dialogbox .vha-errmsg-ln").text();
                    var MaxRetryCount = 10;
                    if (retryCount >= MaxRetryCount) {
                        safeHideLoader();
                        retryCount = 0;
                        return;
                    }
                    if (err.indexOf("SBL") >= 0)
                        targetIndex = currentStepIndex;

                    $("#ssjLoaderOverlay").css("visibility", "visible");
                    $("#_swecontent").children().not("#ssjLoaderOverlay").css("display", "none");
                    if (currentStepIndex == targetIndex) {
                        safeHideLoader();
                        retryCount = 0;
                        SiebelApp.S_App.SetProfileAttr("SSJInitialStart", "N");
                    } else {
                        $(".PlaybarPrev").find(".siebui-icon-navigateprev").click();
                        retryCount++;
                        setTimeout(backNavigation, 500, targetIndex);
                    }
                }

                function autoNavigateToProposition() {
                    if (autoNavInProgress) {
                        try {
                            var err = $(".vha-ssj-dialogbox .vha-errmsg-ln").text();
                            if (err.indexOf("SBL") >= 0)
                                autoNavTargetIndex = currentStepIndex;

                            if (currentStepIndex >= autoNavTargetIndex) {
                                autoNavInProgress = false;
                                safeHideLoader();
                                setTimeout(doProcessing, 50, currentTask);
                                SiebelApp.S_App.SetProfileAttr("SSJInitialStart", "N");
                                sessionStorage.setItem("NavigateTargetStep", "");
                            } else {
                                try {
                                $(".Playbarnext").find(".siebui-icon-navigatenext").click();
                                } catch (e) {
                                    // ignore known Siebel timing issue
                                }

                                setTimeout(autoNavigateToProposition, 100);
                            }
                        } catch (e) {
                            autoNavInProgress = false;
                            safeHideLoader();
                        }
                    }
                }

                function populateHeadings() {
                    var appletMap = activeView.GetAppletMap();
                    var applet = appletMap["VF Task Session Form Applet OUI – SSJ"];
                    var customerName = "",
                        firstName = "",
                        lastName = "",
                        second = "",
                        customerfullname = "";
                    if (applet) {
                        customerName = applet.GetBusComp().GetFieldValue("Customer Name");
                        segment = applet.GetBusComp().GetFieldValue("VF Customer Segment");
                    }

                    if (customerName != "" && customerName != null && customerName != undefined) {
                        const safe = (customerName ?? "").trim();
                        if (safe.includes(",")) {
                            lastName = safe.split(",")[0]?.trim() ?? "";
                            second = (safe.split(",")[1] ?? "").trim().split(/\s+/)[0] ?? "";
                            firstName = second.length > 0 ? second : "";
                        } else {
                            lastName = safe.split(/\s+/)[0] ?? "";
                            second = safe.split(/\s+/)[1] ?? "";
                            firstName = second.length > 0 ? second : "";
                        }
                    } else {
                        firstName = $(".FormItemVertical span:contains('First name')").closest(".FormItemVertical").find('input').val();
                        lastName = $(".FormItemVertical span:contains('Last name')").closest(".FormItemVertical").find('input').val();
                    }

                    if ((firstName == "" || firstName == undefined || firstName == "undefined") && (lastName == "" || lastName == undefined || lastName == "undefined")) {
                        firstName = SiebelApp.S_App.GetProfileAttr("SSJFirstName");
                        lastName = SiebelApp.S_App.GetProfileAttr("SSJLastName");
                    }

                    var applet = appletMap["VHA SSJ Capture Customer Details Toggle Form Applet Person TBUI"];
                    if (applet) {
                        applet.GetBusComp().SetFieldValue("First Name", firstName);
                        applet.GetBusComp().SetFieldValue("Last Name", lastName);
                        applet.GetBusComp().WriteRecord();
                    }

                    var applet = appletMap["VHA Capture Customer Details Toggle Form Applet Corporate OUI - SSJ"];
                    if (applet) {
                        applet.GetBusComp().SetFieldValue("First Name", firstName);
                        applet.GetBusComp().SetFieldValue("Last Name", lastName);
                        applet.GetBusComp().WriteRecord();
                    }

                    var applet = appletMap["VF Task Session Form Applet OUI – SSJ"];
                    if (applet && (activeViewName == "VF Capture Customer Details – Postpay - SSJ" || activeViewName == "VF SSJ Customer ID Details – Postpay TBUI")) {
                        var bc = applet.GetBusComp();
                        bc.SetFieldValue("Customer Name", firstName + " " + lastName);
                        bc.SetFieldValue("VF Customer Segment", segment);
                        bc.WriteRecord();
                    }

                    customerName = firstName + " " + lastName;
                    customerfullname = customerName;
                    setTimeout(() => {
                        $("input[aria-label='Customer Name:']").val(customerfullname);
                    }, 500);

                    if (segment) {
                        customerName = customerName.replace(/\s*\(.*?\)\s*/g, "");
                        customerName = customerName + " (" + segment + ")";
                    }


                    $(".customHeading2").text(customerName);
                    var stepTitle = $("#progressBar .active").find(".label").text();
                    var heading1 = stepTitle;

                    if (stepTitle == "Coverage check")
                        heading1 = "Coverage check";/*sushma*/
                    else if (stepTitle == "Proposition")
                        heading1 = "Proposition and customise";
                    else if (stepTitle == "Prepayment and sharing")
                        heading1 = "Configure prepayment and sharing setup";

                    $(".customHeading1").text(heading1);

                    var ele = $(".vha-ssj-dialogbox");
                    if (ele.length <= 0) {
                        var html = `<div class="vha-ssj-dialogbox"></div>`;
                        $(".customHeading2").after(html);
                    }
                }

                function addStepper(currentTask) {
                    var ele = $(".siebui-task-step").find(".fancytree-title");
                    var lastVisitedStep = $(ele).last().text();
                    if (currentTask != null && tasks[currentTask]) {
                        var lastVisitedStepIndex = steps.findIndex(s => lastVisitedStep.toLowerCase().includes(s.toLowerCase()));
                        var html = "<div id='progressBar' class='progress-container'>";

                        activeStepperName = currentStepName;
                        if (!listOfActiveStepperNames.some(function(stepNameVal) {
                                return String(stepNameVal).toLowerCase() === String(currentStepName).toLowerCase();
                            })) {
                            listOfActiveStepperNames.push(currentStepName);
                            saveVisitedSteps(quoteNum, listOfActiveStepperNames);
                        }

                        steps.forEach((step, index) => {
                            var imgContent = `<img src = 'images/custom/Check.svg'/>`;
                            var circleContent = index < currentStepIndex ? imgContent : (index + 1);
                            html += `
                        <div class="step ${index < currentStepIndex ? 'completed' : ''} ${index === currentStepIndex ? 'active' : ''} ${index > currentStepIndex && index <= lastVisitedStepIndex ? 'visited' : ''}">
                          <div class="circle">${circleContent}</div>
                          <div class="label" stepid="${index}" >${step}</div>
                        </div>
                        `;
                            if (index < steps.length - 1) {
                                html += `<div class="connector ${index < currentStepIndex ? 'completed' : ''}"></div>`;
                            }
                        });

                        html += `</div>`;

                        $("#VFSsjProgBar").empty();
                        $("#VFSsjProgBar").append(html);
                        //Pavani CM-11060
                        if ($("#VFSsjProgBar").next(".customHeading1").length === 0) {
                        var headings = `<div class="customHeading1"></div><div class="customHeading2"></div>`;
                        $("#VFSsjProgBar").after(headings);
                        }
                        $(".step").off('click').on('click', function() {
                            var stepName = $(this).find(".label").text();
                            var stepIndex = $(this).find(".label").attr("stepid");
                            if (Number(stepIndex) < Number(currentStepIndex) || Number(currentStepIndex) != 9)
                                setTimeout(backNavigation, 60, Number(stepIndex));
                        });
                    }

                }

                function addCustomButton(currentTask) {
                    var ele = $(".siebui-task-step").find(".fancytree-title");
                    var lastVisitedStep = $(ele).last().text();
                    var lastIndex = steps.findIndex(s => lastVisitedStep.toLowerCase().includes(s.toLowerCase()));

                    //Next button
                    $(".customNextButton").parent().remove();
                    var nextDiv = $(".Playbarnext");
                    var nexthtml = `<span class="siebui-applet-button"><button class="customNextButton appletButton" data-display="Next" tabindex="0" title="Next" aria-label="Next">Next</button></span>`;
                    $(nextDiv).append(nexthtml);

                    $(".customNextButton").off('click').on('click', function() {
                        nextButton(currentStepIndex, lastIndex);
                    });
                    $(nextDiv).find(".siebui-icon-navigatenext").hide();

                    //Previous button
                    $(".customPrevButton").parent().remove();
                    var preDiv = $(".PlaybarPrev");
                    var prevhtml = `<span class="siebui-applet-button"><button class="customPrevButton" data-display="Back" tabindex="0" title="Back" aria-label="Back">Back</button></span>`;
                    $(preDiv).append(prevhtml);

                    if (Number(currentStepIndex) <= 0 || Number(currentStepIndex) == 9) {
                        $(".customPrevButton").attr("disabled", "disabled");
                        $(".customPrevButton").addClass("appletButtonDis");
                        $(".customPrevButton").hide();
                    } else {
                        $(".customPrevButton").removeAttr("disabled", "disabled");
                        $(".customPrevButton").removeClass("appletButtonDis");
                        $(".customPrevButton").show();
                    }

                    $(".customPrevButton").off('click').on('click', function() {
                        SiebelApp.S_App.SetProfileAttr("CustReadOnlyBack", "Y");
                        var prevIndex = Number(currentStepIndex) - 1;
                        if (!isDFAFlow) {
                            if (!listOfActiveStepperNames.some(function(x) {
                                    return x.toLowerCase().includes("prepayment and sharing");
                                }) &&
                                String(activeStepperName).toLowerCase().includes("order review")) {
                                prevIndex = Number(currentStepIndex) - 2;
                            }
                        }
                        $(".PlaybarPrev").find(".siebui-icon-navigateprev").click();
                    });

                    $(preDiv).find(".siebui-icon-navigateprev").hide();

                    var topApplet = appletMap['VF Task Playbar Applet - Top-SSJ'];
                    var bottomApplet = appletMap['VF SSJ Task Playbar Applet - Bottom'];
                    var appletPM = null;
                    if (topApplet) {
                        appletPM = topApplet.GetPModel();
                    } else if (bottomApplet) {
                        appletPM = bottomApplet.GetPModel();
                    }

                    if (!appletPM) {
                        console.warn("VHASSJNavigationPR: Playbar PM not ready, skipping AddMethod");
                        return;
                    }

                    appletPM.AddMethod("InvokeMethod", function(methodName, inPS, outPS, returnStructure) {
                        if (methodName === "PauseTask") {
                            var bsProcessManager = SiebelApp.S_App.GetService("VF BS Process Manager");
                            var psInputs1 = SiebelApp.S_App.NewPropertySet();
                            var psOutputs1 = SiebelApp.S_App.NewPropertySet();
                            psInputs1.SetProperty("Service Name", "Workflow Process Manager");
                            psInputs1.SetProperty("Method Name", "RunProcess");
                            psInputs1.SetProperty("ProcessName", "VHA SSJ Pause Task Navigate View WF");
                            psInputs1.SetProperty("Object Id", quoteId);
                            psOutputs1 = bsProcessManager.InvokeMethod("Run Process", psInputs1);
                            returnStructure["CancelOperation"] = true;
                            SiebelApp.S_App.uiStatus.Free();
                        }
                        if (methodName === "CancelTask") {
                            var bsProcessManager = SiebelApp.S_App.GetService("VF BS Process Manager");
                            var psInputs1 = SiebelApp.S_App.NewPropertySet();
                            var psOutputs1 = SiebelApp.S_App.NewPropertySet();
                            psInputs1.SetProperty("Service Name", "Workflow Process Manager");
                            psInputs1.SetProperty("Method Name", "RunProcess");
                            psInputs1.SetProperty("ProcessName", "VHA SSJ Back To Cart Navigate View WF");
                            psInputs1.SetProperty("Object Id", quoteId);
                            psOutputs1 = bsProcessManager.InvokeMethod("Run Process", psInputs1);
                            returnStructure["CancelOperation"] = true;
                            SiebelApp.S_App.uiStatus.Free();
                        }
                    }, {
                        sequence: true,
                        scope: this
                    });
                }

                function nextButton(currentIndex, lastIndex) {
                    var proceedFlg = "Y";
                    var sNotifyFound = "N";
                    SiebelApp.S_App.SetProfileAttr("SSJFirstReach", "");
                    SiebelApp.S_App.SetProfileAttr("CustReadOnlyBack", "");
                    if (activeViewName == normalizeText("VF Capture Customer Details – Postpay - SSJ") || activeViewName == normalizeText("VF Capture Exst Customer Details Postpay TBUI - SSJ")) {
                        requiredValidation();
                        reValidateSpecialChar();
                        contactValidation("", "", "");
                        emailValidation("", "", "");
                        validateNameLength();
                        var sApp = SiebelApp.S_App.GetActiveView().GetAppletMap()["VHA Capture Customer Details Toggle Form Applet Corporate OUI - SSJ"];
                        if (sApp) // restricting the customer type selection for business segment to Sole trader
                        {
                            var sSeg = sApp.GetBusComp().GetFieldValue("VF Customer Segment");
                            if (sSeg == "Business") {
                                var sCustType = $('[aria-labelledby^="VF_Customer_Type_Label"]').val(); //CM:11776
                                if (sCustType !== "Sole Trader") {
                                    alert("Please select Customer type value as Sole Trader to Proceed.");
                                    proceedFlg = "N";
                                }

                            } //end
                        }
                    } else if (activeViewName == normalizeText("VF SSJ Customer ID Details – Postpay TBUI")) {
                        var recExist = checkRecordCount("VF SSJ Capture Identification Details List Applet – Postpay TBUI");
                        if (!recExist)
                            requiredValidation();
                    } else if (activeViewName == normalizeText("VF Connection Wizard View - Credit Check – TBUI - SSJ") || activeViewName == normalizeText("VHA Connection Wizard View - Billing Detail - TBUI - SSJ") || activeViewName == normalizeText("VF Coverage Check Details - Postpay - SSJ")) {
                        requiredValidation();
                    } else if (activeViewName == normalizeText("VF SSJ Prepayments View-TBUI")) {
                        validateSharing();
                    } else if (activeViewName == normalizeText("VF SSJ Connection Wizard View – Shopping Cart – TBUI")) {
                        var applet = activeView.GetAppletMap()["VF Dfa Order Entry Line Item List Applet TBUI"];
                        var appletFullId = applet.GetFullId();
                        var pm = applet.GetPModel();
                        var recordSet = pm.Get("GetRecordSet");
                        var count = 0;
                        if (recordSet && recordSet.length > 0) {
                            for (var i = 0; i < recordSet.length; i++) {
                                var sReadyStatus = recordSet[i]["ReadyStatus"];
                                if (sReadyStatus == "Ready")
                                    count++
                            }
                            if (recordSet.length == count) {} else {
                                alert("Please mark all Line items to Ready before Proceeding");
                                return true;
                            }
                        }

                        if (isDFAFlow && SiebelApp.S_App.GetProfileAttr("MakeNotificationRO") === "N" && applet != null) {
                            var recordSet = pm.Get("GetRecordSet");

                            if (recordSet && recordSet.length > 1) {
                                for (var i = 0; i < recordSet.length; i++) {
                                    var sNotifyMSISDNFlg = recordSet[i]["VF AA Set Notification MSISDN"];
                                    if (sNotifyMSISDNFlg === "Y") {
                                        sNotifyFound = "Y";
                                        break;
                                    } else {
                                        alert("Select the Text Notification Flag against one MSISDN in the order line items, else the default will be the first service MSISDN");
                                        return true;
                                    }
                                }
                            }
                        }
                        //proceedFlg = validateSpeed();
                        
                        //VHA KT 080626: Commented for CM-11738
                       /* if (!isDFAFlow) {
                            if (String(activeStepperName).toLowerCase().includes("proposition") &&
                                listOfActiveStepperNames.some(function(x) {
                                    return x.toLowerCase().includes("order review");
                                })) {
                                var goToStepName = "Order review";
                                var ele = $("#SS_TaskUIPane .fancytree-title").filter(function() {
                                    return $(this).text().toLowerCase().includes(goToStepName.toLowerCase());
                                });

                                if ($(ele).length > 0) {
                                    $(ele).click();
                                }
                                return;
                            }
                        }*/

                    }
                    if (appletMap['VF SSJ Prepayment Header Applet']) {
                        sCalcpaymtbtnvalidation();
                    }

                    var hasErrors = $(".FormItemVertical p[style*='color:red']").length > 0;

                    if (activeViewName == "VF Coverage Check Details - Postpay - SSJ") {
                        var applet = SiebelApp.S_App.GetActiveView().GetAppletMap()["VF SSJ Quote Details Applet"];
                        if (applet) {
                            var isFWA = applet.GetBusComp().GetFieldValue("IsFWA");
                            var isVoice = applet.GetBusComp().GetFieldValue("IsVoice");
                            if (isVoice == "Y")
                                hasErrors = $(".CCPaddress .discussed p").length > 0;

                            if (isFWA == "Y" && !(hasErrors)) {
                                var proceedFlag = $(".CCMobileCoverage #vha-or-cover-chk").find("div#vha-or-warning-banner, div.vha-or-warning-banner").hasClass("displaynone");
                                hasErrors = (!proceedFlag); //Updated code line 554 & 555 to fix CM - 11052 by vivek
                            }
                        }
						proceedFlg = validateSpeed();
                    } else if (activeViewName == "VF SSJ Prepayments View-TBUI") {
                        hasErrors = $(".errorMsg").length > 0;
                    }
                    if (hasErrors || proceedFlg == "N") {
                        return true;
                    } else {
                        $(".Playbarnext").find(".siebui-icon-navigatenext").click();
                    }
                }

                function additionalChanges() {
                    var sEditApplet = "";
                    var sEditApplet1 = "";
                    var sBaseApplet = "";
                    var sBaseApplet1 = "";
                    var sView = activeViewName;
                    var VFFinalStat = "";
                    appletMap = activeView.GetAppletMap();
                    var applet = appletMap["VF Task Session Form Applet OUI – SSJ"];
                    if (applet) {
                        segment = applet.GetBusComp().GetFieldValue("VF Customer Segment");
                    }

                    //Customer Deatils
                    if (sView === "VF Capture Exst Customer Details Postpay TBUI - SSJ") {
                        if (segment === "Consumer") {
                            sBaseApplet = appletMap["VF Capture Exst Customer Details Toggle Form Applet Person TBUI - SSJ"];
                            sEditApplet = appletMap["VHA SSJ Exst Capture Customer Details Edit Toggle Form Applet Person TBUI"];
                            sBaseApplet1 = appletMap["VF Capture Exst Customer Details Toggle Form Applet Corporate TBUI - SSJ"];
                            if (sEditApplet && sEditAppltShow != 'Y' && typeof sEditApplet.GetFullId === "function")
                                $("#" + sEditApplet.GetFullId()).hide().attr("aria-hidden", "true");
                            if (sBaseApplet1 && typeof sBaseApplet1.GetFullId === "function")
                                $("#" + sBaseApplet1.GetFullId()).hide().attr("aria-hidden", "true");
                        } else {
                            sBaseApplet = appletMap["VF Capture Exst Customer Details Toggle Form Applet Corporate TBUI - SSJ"];
                            sBaseApplet1 = appletMap["VF Capture Exst Customer Details Toggle Form Applet Person TBUI - SSJ"];
                            sEditApplet = appletMap["VHA Exst Capture Customer Details Toggle Form Applet Corporate OUI - SSJ"];
                            if (sEditApplet && sEditAppltShow != 'Y' && typeof sEditApplet.GetFullId === "function")
                                $("#" + sEditApplet.GetFullId()).hide().attr("aria-hidden", "true");
                            if (sBaseApplet1 && typeof sBaseApplet1.GetFullId === "function")
                                $("#" + sBaseApplet1.GetFullId()).hide().attr("aria-hidden", "true");
                        }
                    }
                    if (sView === "VF Capture Exst Customer Details Postpay TBUI - SSJ") {
                        $(".vha-sfj-Editbtns").on("click", function() {
                            sEditAppltShow = 'Y';
                            if (sBaseApplet && sBaseApplet != "" && typeof sBaseApplet.GetFullId === "function") {
                                $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                            }
                            if (sEditApplet && sEditApplet != "" && typeof sEditApplet.GetFullId === "function") {
                                $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                            }
                        });
                    }

                    //Id Deatils Page
                    else if (sView == "VF SSJ Customer ID Details \u2013 Postpay TBUI") {
                        $('div#CreditCheck').hide();
                    }

                    //Credit Check
                    else if (sView === normalizeText("VF Connection Wizard View - Credit Check – TBUI - SSJ Exist Customer")) {
                        if (segment == "Consumer" || segment == "Business") {
                            sEditApplet = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI Stu-SSJExist"];
                            if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                $("#" + sEditApplet.GetFullId()).hide().attr("aria-hidden", "true");
                            }
                        }

                    }

                    //Billing Details
                    else if (sView === "VHA Connection Wizard View - Exist Billing Detail - TBUI - SSJ") {
                        sEditApplet = appletMap["VHA Billing Account Address List Applet TBUI"];
                        if (sEditApplet && sEditApplet != "" && typeof sEditApplet.GetFullId === "function")
                            $("#" + sEditApplet.GetFullId()).hide().attr("aria-hidden", "true");
                    }
                    if (sView === "VHA Connection Wizard View - Exist Billing Detail - TBUI - SSJ") {
                        $('.vha-sfj-Editbtns button[data-display="Edit"]').on("click", function() {
                            if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                            }
                        });
                    }

                    //Click Event on discard and save button
                    $('.siebui-ctrl-btn.siebui-icon-discardrecord, .siebui-ctrl-btn.siebui-icon-saverecord')
                        .on("click", function() {
                            sEditAppltShow = 'N';
                            if (sBaseApplet && sBaseApplet !== "" && typeof sBaseApplet.GetFullId === "function") {
                                $("#" + sBaseApplet.GetFullId()).show().attr("aria-hidden", "false");
                            }
                            if (sEditApplet && sEditApplet !== "" && typeof sEditApplet.GetFullId === "function") {
                                $("#" + sEditApplet.GetFullId()).hide().attr("aria-hidden", "false");
                            }
                        });

                    $(".vha-sfj-Editbtns").on("click", function() {
                        if (sView === normalizeText("VF Connection Wizard View - Credit Check – TBUI - SSJ Exist Customer") && segment === "Consumer") {
                            var appletCCBaseExist = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI StuRO-SSJExi"] ||
                                appletMap["VHA Com Financial Profile Credit  Toggle Form Applet TBUI DefRO-SSJ - Exist"] ||
                                appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI Emp RO-SSJ - Exist"] ||
                                appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI O StdRO-SSJ - Exis"] ||
                                appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI UnempRO-SSJ-Exist"];
                            if (appletCCBaseExist) {
                                VFFinalStat = appletCCBaseExist.GetBusComp().GetFieldValue("VFFinalStatus");
                            }

                            if (VFFinalStat == "32N") {
                                sEditApplet = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI Stu-SSJExist"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI StuRO-SSJExi"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                            } else if (VFFinalStat == "11N") {
                                sEditApplet = appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI Emp Std-SSJ-Exist"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI Emp RO-SSJ - Exist"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                            } else if (VFFinalStat == "21N") {
                                sEditApplet = appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI O Std-SSJ-Exist"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI O StdRO-SSJ - Exis"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                            } else if (VFFinalStat == "33N") {
                                sEditApplet = appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI Unemp-SSJ-Exist"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit Toggle Form Applet TBUI UnempRO-SSJ-Exist"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                            } else if (VFFinalStat == "N") {
                                sEditApplet = appletMap["VHA Com Financial Profile Credit  Toggle Form Applet TBUI Default-SSJ-Exist"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit  Toggle Form Applet TBUI DefRO-SSJ - Exist"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                            } else if (VFFinalStat == "CSRN") {
                                sEditApplet = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI Unemp CSRSSJ"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit  Toggle Form Applet TBUI DefRO-SSJ - Exist"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                            } else if (VFFinalStat == "RetailN") {
                                sEditApplet = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI Unemp RetSSJ"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit  Toggle Form Applet TBUI DefRO-SSJ - Exist"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                            } else {
                                sBaseApplet = appletMap["VHA Com Financial Profile Credit  Toggle Form Applet TBUI DefRO-SSJ - Exist"];
                                if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                    $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                                }
                                sEditApplet = appletMap["VHA Com Financial Profile Credit  Toggle Form Applet TBUI Default-SSJ-Exist"];
                                if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                    $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                                }
                            }
                        } else if (sView === normalizeText("VF Connection Wizard View - Credit Check – TBUI - SSJ Exist Customer") && segment === "Business") {
                            sBaseApplet = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI CorpYRSSJExi"];
                            sEditApplet = appletMap["VHA Com Financial Profile Credit Check Toggle Form Applet TBUI Stu-SSJExist"];
                            if (sBaseApplet && typeof sBaseApplet.GetFullId === "function") {
                                $("#" + sBaseApplet.GetFullId()).hide().attr("aria-hidden", "true");
                            }
                            if (sEditApplet && typeof sEditApplet.GetFullId === "function") {
                                $("#" + sEditApplet.GetFullId()).show().attr("aria-hidden", "false");
                            }
                        }
                    });
                }

                function normalizeText(s) {
                    return String(s || "")
                        .normalize("NFKC") // Unicode normalization
                        .replace(/[\u2010-\u2015]/g, "-") // hyphen, non-breaking hyphen, en/em/figure/horizontal bar
                        .replace(/\u2212/g, "-") // minus sign
                        .replace(/\u00A0/g, " ") // non-breaking space
                        .replace(/\s+/g, " ") // collapse multiple spaces
                        .trim();
                }

                function getVisitedKey(quoteNum) {
                    return quoteNum ? ("VisitedSteps_" + quoteNum) : "VisitedSteps_";
                }

                function loadVisitedSteps(quoteNum) {
                    try {
                        var saved = localStorage.getItem(getVisitedKey(quoteNum));
                        return saved ? JSON.parse(saved) : [];
                    } catch (e) {
                        return [];
                    }
                }

                function saveVisitedSteps(quoteNum, stepsArr) {
                    try {
                        localStorage.setItem(getVisitedKey(quoteNum), JSON.stringify(stepsArr || []));
                    } catch (e) {
                        /* no-op */
                    }
                }

                function injectNoRecord() {
                    appletMap = activeView.GetAppletMap();
                    if (activeViewName != "VF Coverage Check Details - Postpay - SSJ") {
                        for (var appletName in appletMap) {
                            if (appletMap.hasOwnProperty(appletName)) {
                                var appletPM = appletMap[appletName];
                                var appletFullId = appletPM.GetFullId();
                                var pm = appletPM.GetPModel();
                                var columns = pm.Get("GetListOfColumns");
                                var isListApplet = (columns && Object.keys(columns).length > 0) ? true : false;
                                if (isListApplet) {
                                    var recordSet = pm.Get("GetRecordSet");
                                    var recordCount = (recordSet) ? recordSet.length : 0;

                                    var tableBody = $("#" + appletFullId + " .ui-jqgrid-btable").find("tbody");
                                    if (recordCount === 0) {
                                        $("#" + appletFullId).find(".siebui-row-counter").hide();
                                        var colCount = $("#" + appletFullId).find("table thead th:visible").length;
                                        $(tableBody).find(".NoRecord").remove();
                                        if (appletName === "VHA DFA Billing Setup Applet TBUI") {
                                            var html = "<tr class='NoRecord'><td colspan='" + colCount + "'>No URL generated yet</td></tr>";
                                        } else {
                                            var html = "<tr class='NoRecord'><td colspan='" + colCount + "'>No records found </td></tr>";
                                        }
                                        $(tableBody).append(html);
                                        SiebelApp.S_App.SetProfileAttr('RecordCount', 'No');
                                    } else {
                                        $(tableBody).find(".NoRecord").remove();
                                        SiebelApp.S_App.SetProfileAttr('RecordCount', '');
                                    }
                                }
                            }
                        }
                    }
                }

                VHASSJNavigationPR.prototype.Init = function() {
                    SiebelAppFacade.VHASSJNavigationPR.superclass.Init.apply(this, arguments);
                    autoNavInProgress = false;
                    autoNavTargetIndex = -1;
                }

                VHASSJNavigationPR.prototype.ShowUI = function() {
                    SiebelAppFacade.VHASSJNavigationPR.superclass.ShowUI.apply(this, arguments);

                    activeView = SiebelApp.S_App.GetActiveView();
                    activeViewName = normalizeText(activeView.GetName());
                    
                    // ===== TRACK PREVIOUS VIEW ===== 11630 start
                    if (currentViewTracked !== activeViewName) {
                        prevViewName = currentViewTracked;
                        currentViewTracked = activeViewName;
                    }
                    // ===== CHECKBOX LOGIC =====
                        if (
                            normalizeText(activeViewName) === normalizeText("VF Coverage Check Details - Postpay - SSJ") &&
                            normalizeText(prevViewName) === normalizeText("VF SSJ Connection Wizard View – Shopping Cart – TBUI")
                        ) { 
                            setTimeout(function () {
                                var checkbox = document.getElementById("discussed_coverage");

                                if (checkbox) {
                                    checkbox.checked = true;
                                    checkbox.value = "Y"; 
                                } else {
                                    console.log("❌ Checkbox not found");
                                }
                            }, 50);
                        } //11630 END

                    appletMap = activeView.GetAppletMap();
                    isDFAFlow = VHAAppUtilities.isDFAFlow();
                    quoteNum = SiebelApp.S_App.GetProfileAttr("Order Number");
                    quoteId = SiebelApp.S_App.GetProfileAttr("QuoteId");

                    addSpinner();

                    setTimeout(function() {
                        if ($("#ssjLoaderOverlay").is(":visible")) {
                            safeHideLoader();
                        }
                    }, 15000);

                    $("#SS_TaskUIPane").hide();
                    $(".FormSection span").addClass("siebui-applet-title");

                    currentTask = activeView.GetTaskViewTitle();

                    if (isDFAFlow)
                        currentTask = "DFA";

                    steps = tasks[currentTask];
                    currentStepName = activeView.GetTaskStepTitle();
                    currentStepIndex = steps.findIndex(s => currentStepName.toLowerCase().includes(s.toLowerCase()));
                    isExisting = SiebelApp.S_App.GetProfileAttr("ExistingCustomerFlag");
                    isStart = SiebelApp.S_App.GetProfileAttr("SSJInitialStart");
                    iscartUpdated = sessionStorage.getItem("iscartUpdated"); //VHA KT 150426: Added for CM-10229

                    var prevQuoteNum = localStorage.getItem("NavPR_PrevQuoteNum");

                    if (isStart === "Y" || (quoteNum && quoteNum !== prevQuoteNum)) {
                        listOfActiveStepperNames = [];
                        activeStepperName = "";
                        saveVisitedSteps(quoteNum, []);
                    } else
                        listOfActiveStepperNames = loadVisitedSteps(quoteNum);

                    localStorage.setItem("NavPR_PrevQuoteNum", quoteNum || "");

                    //VHA KT 150426: Added for CM-10229
                    if (iscartUpdated == "Y") {
                        sessionStorage.setItem("iscartUpdated", "");
                        $("#ssjLoaderOverlay").css("visibility", "visible");
                        $("#_swecontent").children().not("#ssjLoaderOverlay").css("display", "none");
                        Options = {};
                        inps = SiebelApp.S_App.NewPropertySet();
                        outs = SiebelApp.S_App.NewPropertySet();
                        inps.SetProperty("QuoteNum", quoteNum);
                        outs = VHAAppUtilities.CallBS("VHA SSJF Generic BS", "ReturnToFulfilmentOrder", inps, Options);
                        var rFStep = outs.GetProperty("sTargetView");
                        var sErrMsg = outs.GetProperty("sErrMsg");
                        // var rFStep = "ID details";
                        if (rFStep != "" && rFStep != null && rFStep != "undefined") {
							
							//SSINGHAL: CM-11619
							/* if(rFStep == "Proposition")
							{
								var applet = SiebelApp.S_App.GetActiveView().GetAppletMap()["VFDFA Line Item Form Apple Propt"];
								if(applet)
								{
									var busComp = applet.GetBusComp();
									if(busComp)
									{
										var device = busComp.GetFieldValue("VF Device TBUI");
										if(device == "" || device == null || device == undefined)
											rFStep = "Coverage check";
									}
								}
							} 
                            */
							
                            var rFIndex = steps.indexOf(rFStep);
                            setTimeout(backNavigation, 500, rFIndex);
                            alert(sErrMsg);
                        }

                    } //VHA KT 150426: Added for CM-10229

                    if (isStart == "Y") {
                        sessionStorage.setItem("ReqMinPP", 0);
                        sessionStorage.setItem("sharingFlg", "");
                        $("#ssjLoaderOverlay").css("visibility", "visible");
                        $("#_swecontent").children().not("#ssjLoaderOverlay").css("display", "none");

                        autoNavInProgress = true;

                        var targetStep = sessionStorage.getItem("NavigateTargetStep");
                        if (targetStep != "" && targetStep != undefined && targetStep != "undefined") {} else {
                            var Options = {};
                            var inp = SiebelApp.S_App.NewPropertySet();
                            var out = SiebelApp.S_App.NewPropertySet();
                            inp.SetProperty("QuoteNum", quoteNum);
                            out = VHAAppUtilities.CallBS("VHA SSJ Generic Utility Service", "NavigationRule", inp, Options);
                            targetStep = out.GetProperty("sTargetView");

                            if (targetStep == "" || targetStep == null || targetStep == undefined || targetStep == "undefined") {
                                targetStep = "Customer details";
                            }
                            sessionStorage.setItem("NavigateTargetStep", targetStep);
                        }
                        autoNavTargetIndex = steps.indexOf(targetStep);
                        setTimeout(autoNavigateToProposition, 50);
                    } else {
                        safeHideLoader();
                        setTimeout(function() {
                            injectNoRecord();
                            addCustomButton(currentTask);
                            changeButtonCaption();
                        }, 500);
                        addStepper(currentTask);
                        populateHeadings();
                        additionalChanges();
                        VHAAppUtilities.bindChangeEvent();
                    }
                }

                VHASSJNavigationPR.prototype.BindData = function(bRefresh) {
                    SiebelAppFacade.VHASSJNavigationPR.superclass.BindData.apply(this, arguments);
                }

                VHASSJNavigationPR.prototype.BindEvents = function() {
                    SiebelAppFacade.VHASSJNavigationPR.superclass.BindEvents.apply(this, arguments);
                }

                VHASSJNavigationPR.prototype.EndLife = function() {
                    SiebelAppFacade.VHASSJNavigationPR.superclass.EndLife.apply(this, arguments);
                }

                return VHASSJNavigationPR;
            }());
            return "SiebelAppFacade.VHASSJNavigationPR";
        })
}