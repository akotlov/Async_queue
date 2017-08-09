import React, { Component } from "react";
import RaisedButton from "material-ui/RaisedButton";
import Dialog from "material-ui/Dialog";
import { deepOrange500, indigo500 } from "material-ui/styles/colors";
import FlatButton from "material-ui/FlatButton";
import getMuiTheme from "material-ui/styles/getMuiTheme";
import MuiThemeProvider from "material-ui/styles/MuiThemeProvider";
import TextField from "material-ui/TextField";

import { Tabs, Tab } from "material-ui/Tabs";
import {
  Card,
  CardActions,
  CardHeader,
  CardMedia,
  CardTitle,
  CardText
} from "material-ui/Card";

import {
  Table,
  TableBody,
  TableHeader,
  TableHeaderColumn,
  TableRow,
  TableRowColumn
} from "material-ui/Table";

import Paper from "material-ui/Paper";
import Divider from "material-ui/Divider";
import { List, ListItem } from "material-ui/List";

const moment = require("moment");

const formatDate = date =>
  // let _date = new Date(date);
  moment(date).format("MMMM Do, h:mm A");

// From https://github.com/oliviertassinari/react-swipeable-views
import SwipeableViews from "react-swipeable-views";

// const SERVER_URL = 'http://192.168.43.104:4000'
// const SERVER_URL = 'http://localhost:4000'
// const SERVER_URL = 'https://quiet-brook-30280.herokuapp.com'

import HtmlIframe from "./HtmlIframe";

const styles = {
  slide: {
    padding: 5
  }
};

const emailStyle = {
  cursor: "pointer",
  textAlign: "center",
  height: "48",
  outline: "none",
  fontSize: "17",
  boxSizing: "border-box",
  marginTop: "30"
};

const paperStyle = {
  height: "100%",
  width: "100%",
  marginTop: 15,
  display: "inline-block",
  padding: 15
};

const containerStyle = {
  container: {
    // textAlign: 'center',
    // paddingTop: 200,
  }
};

const skillsSectionHeaderStyle = {
  fontSize: "1.4em",
  color: "#2C7882",
  // fontWeight: 'bold',
  // fontVariant: 'small-caps',
  textAlign: "center"
};

const projectsCardTitleStyle = {
  fontSize: "1.5em",
  // fontWeight: 'bold',
  fontVariant: "small-caps",
  // textAlign: 'center',
  paddingBottom: "5px"
};
const projectsCardTitleStyle2 = {
  fontSize: "1.1em",
  paddingBottom: "5px"
};

const muiTheme = getMuiTheme({
  palette: {
    accent1Color: deepOrange500
  }
});

const customContentStyle = {
  width: "100%",
  maxWidth: "none"
};

class Main extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      slideIndex: 0,
      content: null,
      urlString: "",
      jobIDs: [],
      htmlContent: null,
      error_msg: null,
      open: false,
      dialogTitle: null
    };
  }

  componentDidMount() {
    console.log("componentDidMount");
    this.fetchAll();
  }

  handleOpen = () => {
    this.setState({ open: true });
  };

  handleClose = () => {
    this.setState({ open: false });
    this.setState({ htmlContent: null });
    this.setState({ dialogTitle: null });
  };

  handleChange = value => {
    this.setState({
      slideIndex: value
    });
  };

  fetchAll = () => {
    fetch("/api/jobs", {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=UTF-8" // maybe no charset=UTF-8?
      },
      method: "GET"
    })
      // .then(resp => resp.text())
      .then(resp => resp.json())
      .then(data => {
        if (data.error) throw data.error.message || "Unable to search";
        return data;
      })
      .then(data => {
        console.log(data);
        this.setState(prevState => ({
          jobIDs: prevState.jobIDs.concat(data)
        }));
        // this.state.jobIDs.push(data)
      })
      .catch(err => {
        console.log(err);
      });
  };

  submitUrl = () => {
    const component = this;
    function checkStatus(response) {
      // if (response.status >= 200 && response.status < 300) {
      if (response.ok) {
        return response;
      }
      const error = new Error(response.statusText);
      error.response = response;
      throw error;
    }

    function parseJSON(response) {
      return response.json();
    }

    if (this.state.urlString !== "") {
      fetch(`/create_job_async/${this.state.urlString}`, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=UTF-8"
        },
        method: "POST"
      })
        .then(checkStatus)
        .then(parseJSON)
        .then(data => {
          console.log("request succeeded with JSON response", data);
          component.setState(prevState => ({
            jobIDs: prevState.jobIDs.concat(data)
          }));
        })
        .catch(error => {
          console.log("request failed", error);
          if (!error.response) {
            component.setState({ error_msg: "Connection problem" });
          }
          if (error.response.status === 406) {
            component.setState({
              error_msg: "Not a valid url or no HTML returned"
            });
          } else {
            component.setState({ error_msg: error.response.statusText });
          }
        });
    } else {
      this.setState({ error_msg: "Can't submit NOTHING" });
    }
  };

  checkJobStatus = job => {
    const component = this;
    console.log(job);
    function updateJobState() {
      const updated = component.state.jobIDs.map(jobToUpdate => {
        if (jobToUpdate.job_id === job.job_id) {
          jobToUpdate.status = "completed";
        }
        return jobToUpdate;
      });
      return { ...component.state, jobIDs: updated };
    }

    fetch(`/api/job/${job}`, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=UTF-8" // maybe no charset=UTF-8?
      },
      method: "GET"
    })
      .then(resp => resp.json())
      .then(data => {
        /*if (data.status === "processing" || data.status === "error") {
          this.setState({ dialogTitle: data.status });
          this.setState({ htmlContent: data.error_msg }, function() {
            this.handleOpen();
          });
          return;
        }*/
        console.log(data);
        //this.setState({ dialogTitle: data.status });
        this.setState({ htmlContent: data }, function() {
          this.handleOpen();
        });
        //updateJobState();
        // this.handleOpen()
      })
      .catch(err => {
        console.log(err);
      });
  };

  onInputChange = (event, value) => {
    console.log(value);
    this.setState({ error_msg: null });
    this.setState({ urlString: value });
  };

  render() {
    const actions = [
      <FlatButton label="close" primary onTouchTap={this.handleClose} />
    ];

    return (
      <MuiThemeProvider muiTheme={muiTheme}>
        <div style={containerStyle.container}>
          <Tabs onChange={this.handleChange} value={this.state.slideIndex}>
            <Tab label="1" value={0} />
            <Tab label="2" value={1} />
          </Tabs>

          <SwipeableViews
            index={this.state.slideIndex}
            onChangeIndex={this.handleChange}
          >
            <div
              style={{ fontFamily: "Roboto, sans-serif" }}
              style={styles.slide}
            >
              <Paper style={paperStyle} zDepth={1}>
                <p
                  style={{
                    fontSize: "1.4em",
                    fontWeight: "normal",
                    textAlign: "center"
                  }}
                >
                  Enter Url to start a new job
                </p>
                <div
                  style={{
                    fontSize: "1.4em",
                    fontWeight: "normal",
                    textAlign: "center"
                  }}
                >
                  <TextField
                    hintText="https://caolan.github.io/"
                    errorText={this.state.error_msg}
                    onChange={this.onInputChange}
                  />
                  <br />
                  <RaisedButton
                    label="Submit"
                    primary
                    onClick={this.submitUrl}
                  />
                </div>
              </Paper>

              <Paper style={paperStyle} zDepth={1}>
                <p
                  style={{
                    fontSize: "1.4em",
                    fontWeight: "normal",
                    textAlign: "center"
                  }}
                >
                  Submitted jobs: {this.state.jobIDs.length}
                </p>

                {this.state.jobIDs.map(job =>
                  <Card
                    key={job.attr.id}
                    style={{ marginTop: "12px" }}
                    initiallyExpanded={false}
                  >
                    <CardHeader
                      titleStyle={projectsCardTitleStyle2}
                      title={job.attr.rel}
                      subtitle={job.attr.id}
                      actAsExpander
                      showExpandableButton
                    />

                    <CardText expandable>
                      {job.data}
                      <br />
                    </CardText>
                    <CardActions expandable>
                      <RaisedButton
                        labelStyle={{ fontSize: "0.9em" }}
                        primary
                        onTouchTap={() => {
                          this.checkJobStatus(job.fullKey);
                        }}
                        label="Check job status / results"
                      >
                        {" "}
                      </RaisedButton>
                      {job.status === "completed" ? <div /> : null}
                    </CardActions>
                  </Card>
                )}
              </Paper>

              <Dialog
                title={this.state.dialogTitle}
                actions={actions}
                modal
                open={this.state.open}
                onRequestClose={this.handleClose}
                contentStyle={customContentStyle}
                autoScrollBodyContent
              >
                <Table>
                  <TableHeader displaySelectAll={false}>
                    <TableRow>
                      <TableHeaderColumn>Field</TableHeaderColumn>
                      <TableHeaderColumn>Value</TableHeaderColumn>
                    </TableRow>
                  </TableHeader>
                  <TableBody displayRowCheckbox={false}>
                    {this.state.htmlContent !== null
                      ? Object.keys(
                          this.state.htmlContent.data
                        ).map((keyName, index) =>
                          <TableRow key={index}>
                            <TableRowColumn>
                              {keyName}
                            </TableRowColumn>
                            <TableRowColumn>
                              {this.state.htmlContent.data[keyName]}
                            </TableRowColumn>
                          </TableRow>
                        )
                      : null}
                  </TableBody>
                </Table>
              </Dialog>
            </div>

            <div
              style={{ fontFamily: "Roboto, sans-serif" }}
              style={styles.slide}
            >
              <Paper style={paperStyle} zDepth={1}>
                {this.state.jobIDs.map(job =>
                  <Card
                    key={job.attr.id}
                    style={{ marginTop: "12px" }}
                    initiallyExpanded={false}
                  >
                    <CardHeader
                      titleStyle={projectsCardTitleStyle2}
                      title={job.attr.rel}
                      subtitle={job.attr.id}
                      actAsExpander
                      showExpandableButton
                    />

                    <CardText expandable>
                      {job.data}
                      <br />
                    </CardText>
                    <CardActions expandable>
                      <RaisedButton
                        labelStyle={{ fontSize: "0.9em" }}
                        primary
                        onTouchTap={() => {
                          this.checkJobStatus(job.fullKey);
                        }}
                        label="Check job status / results"
                      >
                        {" "}
                      </RaisedButton>
                      {job.status === "completed" ? <div /> : null}
                    </CardActions>
                  </Card>
                )}
              </Paper>
            </div>
          </SwipeableViews>
        </div>
      </MuiThemeProvider>
    );
  }
}

export default Main;

/* switch (error) {
        case error.response.status === 406 :
              component.setState({error_msg: "Url is not valid"})
        break; 
      
        case FILE_UPLOAD_SUCCESS:
          break; 
        
        case FILE_UPLOAD_ERROR:
        break 
            
        default:
          console.log('Sorry, we are out of ' + expr + '.');
      } */
