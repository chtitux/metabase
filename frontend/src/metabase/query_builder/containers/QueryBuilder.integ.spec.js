import {
    login,
    whenOffline,
    createSavedQuestion,
    createTestStore,
} from "metabase/__support__/integrated_tests";

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
    INITIALIZE_QB,
    QUERY_COMPLETED,
    QUERY_ERRORED,
    RUN_QUERY,
    CANCEL_QUERY,
    SET_DATASET_QUERY,
    REMOVE_QUERY_FILTER,
    UPDATE_QUERY_FILTER,
    setQueryDatabase,
    setQuerySourceTable
} from "metabase/query_builder/actions";
import { SET_ERROR_PAGE } from "metabase/redux/app";

import QueryHeader from "metabase/query_builder/components/QueryHeader";
import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";
import FieldList, { DimensionPicker } from "metabase/query_builder/components/FieldList";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import VisualizationError from "metabase/query_builder/components/VisualizationError";

import CheckBox from "metabase/components/CheckBox";
import FilterWidget from "metabase/query_builder/components/filters/FilterWidget";
import FieldName from "metabase/query_builder/components/FieldName";
import RunButton from "metabase/query_builder/components/RunButton";

import VisualizationSettings from "metabase/query_builder/components/VisualizationSettings";
import Visualization from "metabase/visualizations/components/Visualization";
import TableSimple from "metabase/visualizations/components/TableSimple";

import {delay} from "metabase/lib/promise"

import {
    ORDERS_TOTAL_FIELD_ID,
    unsavedOrderCountQuestion
} from "metabase/__support__/sample_dataset_fixture";
import OperatorSelector from "metabase/query_builder/components/filters/OperatorSelector";
import BreakoutWidget from "metabase/query_builder/components/BreakoutWidget";
import { getQueryResults } from "metabase/query_builder/selectors";

const initQbWithDbAndTable = (dbId, tableId) => {
    return async () => {
        const store = await createTestStore()
        store.pushPath("/question");
        const qb = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB]);

        // Use Products table
        store.dispatch(setQueryDatabase(dbId));
        store.dispatch(setQuerySourceTable(tableId));
        await store.waitForActions([FETCH_TABLE_METADATA]);
        store.resetDispatchedActions();

        return { store, qb }
    }
}

const initQbWithOrdersTable = initQbWithDbAndTable(1, 1)
const initQBWithReviewsTable = initQbWithDbAndTable(1, 4)

describe("QueryBuilder", () => {
    beforeAll(async () => {
        await login()
    })

    /**
     * Simple tests for seeing if the query builder renders without errors
     */
    describe("for new questions", async () => {
        it("renders normally on page load", async () => {
            const store = await createTestStore()

            store.pushPath("/question");
            const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
            await store.waitForActions([INITIALIZE_QB]);

            expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
            expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1)
        });
    });

    describe("visualization settings", () => {
        it("lets you hide a field for a raw data table", async () => {
            const { store, qb } = await initQBWithReviewsTable();

            // Run the raw data query
            qb.find(RunButton).simulate("click");
            await store.waitForActions([QUERY_COMPLETED]);

            const vizSettings = qb.find(VisualizationSettings);
            vizSettings.find(".Icon-gear").simulate("click");

            const settingsModal = vizSettings.find(".test-modal")
            const table = settingsModal.find(TableSimple);

            expect(table.find('div[children="Created At"]').length).toBe(1);

            const doneButton = settingsModal.find(".Button--primary.disabled")
            expect(doneButton.length).toBe(1)

            const fieldsToIncludeCheckboxes = settingsModal.find(CheckBox)
            expect(fieldsToIncludeCheckboxes.length).toBe(6)

            fieldsToIncludeCheckboxes.at(3).simulate("click");

            expect(table.find('div[children="Created At"]').length).toBe(0);

            // Save the settings
            doneButton.simulate("click");
            expect(vizSettings.find(".test-modal").length).toBe(0);

            // Don't test the contents of actual table visualization here as react-virtualized doesn't seem to work
            // very well together with Enzyme
        })
    })

    describe("for saved questions", async () => {
        let savedQuestion = null;
        beforeAll(async () => {
            savedQuestion = await createSavedQuestion(unsavedOrderCountQuestion)
        })

        it("renders normally on page load", async () => {
            const store = await createTestStore()
            store.pushPath(savedQuestion.getUrl(savedQuestion));
            const qbWrapper = mount(store.connectContainer(<QueryBuilder />));

            await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
            expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe(savedQuestion.displayName())
        });
        it("shows an error page if the server is offline", async () => {
            const store = await createTestStore()

            await whenOffline(async () => {
                store.pushPath(savedQuestion.getUrl());
                mount(store.connectContainer(<QueryBuilder />));
                // only test here that the error page action is dispatched
                // (it is set on the root level of application React tree)
                await store.waitForActions([INITIALIZE_QB, SET_ERROR_PAGE]);
            })
        })
        it("doesn't execute the query if user cancels it", async () => {
            const store = await createTestStore()
            store.pushPath(savedQuestion.getUrl());
            const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
            await store.waitForActions([INITIALIZE_QB, RUN_QUERY]);

            const runButton = qbWrapper.find(RunButton);
            expect(runButton.text()).toBe("Cancel");
            expect(runButton.simulate("click"));

            await store.waitForActions([CANCEL_QUERY, QUERY_ERRORED]);
            expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe(savedQuestion.displayName())
            expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1)
        })
    });


    describe("for dirty questions", async () => {
        describe("without original saved question", () => {
            it("renders normally on page load", async () => {
                const store = await createTestStore()
                store.pushPath(unsavedOrderCountQuestion.getUrl());
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

                expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                expect(qbWrapper.find(Visualization).length).toBe(1)
            });
            it("fails with a proper error message if the query is invalid", async () => {
                const invalidQuestion = unsavedOrderCountQuestion.query()
                    .addBreakout(["datetime-field", ["field-id", 12345], "day"])
                    .question();

                const store = await createTestStore()
                store.pushPath(invalidQuestion.getUrl());
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

                // TODO: How to get rid of the delay? There is asynchronous initialization in some of VisualizationError parent components
                // Making the delay shorter causes Jest test runner to crash, see https://stackoverflow.com/a/44075568
                expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                expect(qbWrapper.find(VisualizationError).length).toBe(1)
                expect(qbWrapper.find(VisualizationError).text().includes("There was a problem with your question")).toBe(true)
            });
            it("fails with a proper error message if the server is offline", async () => {
                const store = await createTestStore()

                await whenOffline(async () => {
                    store.pushPath(unsavedOrderCountQuestion.getUrl());
                    const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                    await store.waitForActions([INITIALIZE_QB, QUERY_ERRORED]);

                    expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                    expect(qbWrapper.find(VisualizationError).length).toBe(1)
                    expect(qbWrapper.find(VisualizationError).text().includes("We're experiencing server issues")).toBe(true)
                })
            })
            it("doesn't execute the query if user cancels it", async () => {
                const store = await createTestStore()
                store.pushPath(unsavedOrderCountQuestion.getUrl());
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, RUN_QUERY]);

                const runButton = qbWrapper.find(RunButton);
                expect(runButton.text()).toBe("Cancel");
                expect(runButton.simulate("click"));

                await store.waitForActions([CANCEL_QUERY, QUERY_ERRORED]);
                expect(qbWrapper.find(QueryHeader).find("h1").text()).toBe("New question")
                expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1)
            })
        })
        describe("with original saved question", () => {
            it("should render normally on page load", async () => {
                const store = await createTestStore()
                const savedQuestion = await createSavedQuestion(unsavedOrderCountQuestion);

                const dirtyQuestion = savedQuestion
                    .query()
                    .addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID])
                    .question()

                store.pushPath(dirtyQuestion.getUrl(savedQuestion));
                const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
                await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

                const title = qbWrapper.find(QueryHeader).find("h1")
                expect(title.text()).toBe("New question")
                expect(title.parent().children().at(1).text()).toBe(`started from ${savedQuestion.displayName()}`)
            });
        });
    });

    describe("editor bar", async() => {
        describe("for filtering by Rating category field in Reviews table", () =>  {
            let store = null;
            let qb = null;
            beforeAll(async () => {
                ({ store, qb } = await initQBWithReviewsTable());
            })

            // NOTE: Sequential tests; these may fail in a cascading way but shouldn't affect other tests

            it("lets you add Rating field as a filter", async () => {
                // TODO Atte Keinänen 7/13/17: Extracting GuiQueryEditor's contents to smaller React components
                // would make testing with selectors more natural
                const filterSection = qb.find('.GuiBuilder-filtered-by');
                const addFilterButton = filterSection.find('.AddButton');
                addFilterButton.simulate("click");

                const filterPopover = filterSection.find(FilterPopover);

                const ratingFieldButton = filterPopover.find(FieldList).find('h4[children="Rating"]')
                expect(ratingFieldButton.length).toBe(1);
                ratingFieldButton.simulate('click');
            })

            it("lets you see its field values in filter popover", () => {
                // Same as before applies to FilterPopover too: individual list items could be in their own components
                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                expect(fieldItems.length).toBe(5);

                // should be in alphabetical order
                expect(fieldItems.first().text()).toBe("1")
                expect(fieldItems.last().text()).toBe("5")
            })

            it("lets you set 'Rating is 5' filter", async () => {
                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                const widgetFieldItem = fieldItems.last();
                const widgetCheckbox = widgetFieldItem.find(CheckBox);

                expect(widgetCheckbox.props().checked).toBe(false);
                widgetFieldItem.children().first().simulate("click");
                expect(widgetCheckbox.props().checked).toBe(true);

                const addFilterButton = filterPopover.find('button[children="Add filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])
                store.resetDispatchedActions();

                expect(qb.find(FilterPopover).length).toBe(0);
                const filterWidget = qb.find(FilterWidget);
                expect(filterWidget.length).toBe(1);
                expect(filterWidget.text()).toBe("Rating is equal to5");
            })

            it("lets you set 'Rating is 5 or 4' filter", async () => {
                // reopen the filter popover by clicking filter widget
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(FieldName).simulate('click');

                const filterPopover = qb.find(FilterPopover);
                const fieldItems = filterPopover.find('li');
                const widgetFieldItem = fieldItems.at(3);
                const gadgetCheckbox = widgetFieldItem.find(CheckBox);

                expect(gadgetCheckbox.props().checked).toBe(false);
                widgetFieldItem.children().first().simulate("click");
                expect(gadgetCheckbox.props().checked).toBe(true);

                const addFilterButton = filterPopover.find('button[children="Update filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])

                expect(qb.find(FilterPopover).length).toBe(0);
                expect(filterWidget.text()).toBe("Rating is equal to2 selections");
            })

            it("lets you remove the added filter", async () => {
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(".Icon-close").simulate('click');
                await store.waitForActions([SET_DATASET_QUERY])

                expect(qb.find(FilterWidget).length).toBe(0);
            })
        })

        describe("for filtering by ID number field in Reviews table", () => {
            let store = null;
            let qb = null;
            beforeAll(async () => {
                ({ store, qb } = await initQBWithReviewsTable());
            })

            it("lets you add ID field as a filter", async () => {
                const filterSection = qb.find('.GuiBuilder-filtered-by');
                const addFilterButton = filterSection.find('.AddButton');
                addFilterButton.simulate("click");

                const filterPopover = filterSection.find(FilterPopover);

                const ratingFieldButton = filterPopover.find(FieldList).find('h4[children="ID"]')
                expect(ratingFieldButton.length).toBe(1);
                ratingFieldButton.simulate('click');
            })

            it("lets you see a correct number of operators in filter popover", () => {
                const filterPopover = qb.find(FilterPopover);

                const operatorSelector = filterPopover.find(OperatorSelector);
                const moreOptionsIcon = operatorSelector.find(".Icon-chevrondown");
                moreOptionsIcon.simulate("click");

                expect(operatorSelector.find("button").length).toBe(9)
            })

            it("lets you set 'ID is 10' filter", async () => {
                const filterPopover = qb.find(FilterPopover);
                const filterInput = filterPopover.find("textarea");
                filterInput.simulate('change', { target: { value: "10" }})

                const addFilterButton = filterPopover.find('button[children="Add filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])
                store.resetDispatchedActions();

                expect(qb.find(FilterPopover).length).toBe(0);
                const filterWidget = qb.find(FilterWidget);
                expect(filterWidget.length).toBe(1);
                expect(filterWidget.text()).toBe("ID is equal to10");
            })

            it("lets you update the filter to 'ID is 10 or 11'", async () => {
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(FieldName).simulate('click');

                const filterPopover = qb.find(FilterPopover);
                const filterInput = filterPopover.find("textarea");

                // Intentionally use a value with lots of extra spaces
                filterInput.simulate('change', { target: { value: "  10,      11" }})

                const addFilterButton = filterPopover.find('button[children="Update filter"]')
                addFilterButton.simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])

                expect(qb.find(FilterPopover).length).toBe(0);
                expect(filterWidget.text()).toBe("ID is equal to2 selections");
            });

            it("lets you update the filter to 'ID is between 1 or 100'", async () => {
                const filterWidget = qb.find(FilterWidget);
                filterWidget.find(FieldName).simulate('click');

                const filterPopover = qb.find(FilterPopover);
                const operatorSelector = filterPopover.find(OperatorSelector);
                operatorSelector.find('button[children="Between"]').simulate("click");

                const betweenInputs = filterPopover.find("textarea");
                expect(betweenInputs.length).toBe(2);

                expect(betweenInputs.at(0).props().value).toBe("10, 11");

                betweenInputs.at(1).simulate('change', { target: { value: "asdasd" }})
                const updateFilterButton = filterPopover.find('button[children="Update filter"]')
                expect(updateFilterButton.props().className).toMatch(/disabled/);

                betweenInputs.at(0).simulate('change', { target: { value: "1" }})
                betweenInputs.at(1).simulate('change', { target: { value: "100" }})

                updateFilterButton.simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])
                expect(qb.find(FilterPopover).length).toBe(0);
                expect(filterWidget.text()).toBe("ID between1100");
            });
        })

        describe("for grouping by Total in Orders table", async () => {
            let store = null;
            let qb = null;
            beforeAll(async () => {
                ({ store, qb } = await initQbWithOrdersTable());
            })

            it("lets you group by Total with the default binning option", async () => {
                const breakoutSection = qb.find('.GuiBuilder-groupedBy');
                const addBreakoutButton = breakoutSection.find('.AddButton');
                addBreakoutButton.simulate("click");

                const breakoutPopover = breakoutSection.find("#BreakoutPopover")
                const subtotalFieldButton = breakoutPopover.find(FieldList).find('h4[children="Total"]')
                expect(subtotalFieldButton.length).toBe(1);
                subtotalFieldButton.simulate('click');

                await store.waitForActions([SET_DATASET_QUERY])

                const breakoutWidget = qb.find(BreakoutWidget).first();
                expect(breakoutWidget.text()).toBe("Total: Auto binned");
            });
            it("produces correct results for default binning option", async () => {
                // Run the raw data query
                qb.find(RunButton).simulate("click");
                await store.waitForActions([QUERY_COMPLETED]);

                // We can use the visible row count as we have a low number of result rows
                expect(qb.find(".ShownRowCount").text()).toBe("Showing 6 rows");

                // Get the binning
                const results = getQueryResults(store.getState())[0]
                const breakoutBinningInfo = results.data.cols[0].binning_info;
                expect(breakoutBinningInfo.binning_strategy).toBe("num-bins");
                expect(breakoutBinningInfo.bin_width).toBe(20);
                expect(breakoutBinningInfo.num_bins).toBe(8);
            })
            it("lets you change the binning strategy to 100 bins", async () => {
                const breakoutWidget = qb.find(BreakoutWidget).first();
                breakoutWidget.find(FieldName).children().first().simulate("click")
                const breakoutPopover = qb.find("#BreakoutPopover")

                const subtotalFieldButton = breakoutPopover.find(FieldList).find('.List-item--selected h4[children="Auto binned"]')
                expect(subtotalFieldButton.length).toBe(1);
                subtotalFieldButton.simulate('click');

                qb.find(DimensionPicker).find('a[children="100 bins"]').simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])
                expect(breakoutWidget.text()).toBe("Total: 100 bins");
            });
            it("produces correct results for 100 bins", async () => {
                store.resetDispatchedActions();
                qb.find(RunButton).simulate("click");
                await store.waitForActions([QUERY_COMPLETED]);

                expect(qb.find(".ShownRowCount").text()).toBe("Showing 95 rows");
                const results = getQueryResults(store.getState())[0]
                const breakoutBinningInfo = results.data.cols[0].binning_info;
                expect(breakoutBinningInfo.binning_strategy).toBe("num-bins");
                expect(breakoutBinningInfo.bin_width).toBe(1);
                expect(breakoutBinningInfo.num_bins).toBe(100);
            })
            it("lets you disable the binning", async () => {
                const breakoutWidget = qb.find(BreakoutWidget).first();
                breakoutWidget.find(FieldName).children().first().simulate("click")
                const breakoutPopover = qb.find("#BreakoutPopover")

                const subtotalFieldButton = breakoutPopover.find(FieldList).find('.List-item--selected h4[children="100 bins"]')
                expect(subtotalFieldButton.length).toBe(1);
                subtotalFieldButton.simulate('click');

                qb.find(DimensionPicker).find('a[children="Don\'t bin"]').simulate("click");
            });
            it("produces the expected count of rows when no binning", async () => {
                store.resetDispatchedActions();
                qb.find(RunButton).simulate("click");
                await store.waitForActions([QUERY_COMPLETED]);

                // We just want to see that there are a lot more rows than there would be if a binning was active
                expect(qb.find(".ShownRowCount").text()).toBe("Showing first 2,000 rows");

                const results = getQueryResults(store.getState())[0]
                expect(results.data.cols[0].binning_info).toBe(undefined);
            });
        })

        describe("for grouping by Latitude location field through Users FK in Orders table", async () => {
            let store = null;
            let qb = null;
            beforeAll(async () => {
                ({ store, qb } = await initQbWithOrdersTable());
            })

            it("lets you group by Latitude with the default binning option", async () => {
                const breakoutSection = qb.find('.GuiBuilder-groupedBy');
                const addBreakoutButton = breakoutSection.find('.AddButton');
                addBreakoutButton.simulate("click");

                const breakoutPopover = breakoutSection.find("#BreakoutPopover")

                const userSectionButton = breakoutPopover.find(FieldList).find('h3[children="User"]')
                expect(userSectionButton.length).toBe(1);
                userSectionButton.simulate("click");

                const subtotalFieldButton = breakoutPopover.find(FieldList).find('h4[children="Latitude"]')
                expect(subtotalFieldButton.length).toBe(1);
                subtotalFieldButton.simulate('click');

                await store.waitForActions([SET_DATASET_QUERY])

                const breakoutWidget = qb.find(BreakoutWidget).first();
                expect(breakoutWidget.text()).toBe("Latitude: Auto binned");
            });

            it("produces correct results for default binning option", async () => {
                // Run the raw data query
                qb.find(RunButton).simulate("click");
                await store.waitForActions([QUERY_COMPLETED]);

                expect(qb.find(".ShownRowCount").text()).toBe("Showing 18 rows");

                const results = getQueryResults(store.getState())[0]
                const breakoutBinningInfo = results.data.cols[0].binning_info;
                expect(breakoutBinningInfo.binning_strategy).toBe("bin-width");
                expect(breakoutBinningInfo.bin_width).toBe(10);
                expect(breakoutBinningInfo.num_bins).toBe(18);
            })

            it("lets you group by Latitude with the 'Bin every 1 degree'", async () => {
                const breakoutWidget = qb.find(BreakoutWidget).first();
                breakoutWidget.find(FieldName).children().first().simulate("click")
                const breakoutPopover = qb.find("#BreakoutPopover")

                const subtotalFieldButton = breakoutPopover.find(FieldList).find('.List-item--selected h4[children="Auto binned"]')
                expect(subtotalFieldButton.length).toBe(1);
                subtotalFieldButton.simulate('click');

                qb.find(DimensionPicker).find('a[children="Bin every 1 degree"]').simulate("click");

                await store.waitForActions([SET_DATASET_QUERY])
                expect(breakoutWidget.text()).toBe("Latitude: 1°");
            });
            it("produces correct results for 'Bin every 1 degree'", async () => {
                // Run the raw data query
                store.resetDispatchedActions();
                qb.find(RunButton).simulate("click");
                await store.waitForActions([QUERY_COMPLETED]);

                expect(qb.find(".ShownRowCount").text()).toBe("Showing 180 rows");

                const results = getQueryResults(store.getState())[0]
                const breakoutBinningInfo = results.data.cols[0].binning_info;
                expect(breakoutBinningInfo.binning_strategy).toBe("bin-width");
                expect(breakoutBinningInfo.bin_width).toBe(1);
                expect(breakoutBinningInfo.num_bins).toBe(180);
            })
        });
    })
});
