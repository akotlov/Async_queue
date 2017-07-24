 
//const SERVER_URL = 'http://192.168.43.104:4000'
const SERVER_URL = 'http://localhost:4000'
//const SERVER_URL = 'https://quiet-brook-30280.herokuapp.com' //TODO check on what PORT the app runs

 export const fetchAll = () => {
    // TODO check if proper URL
    fetch(`${SERVER_URL}/jobs`, {
     headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8', // maybe no charset=UTF-8?
      },
      method: 'GET',
      /*body: JSON.stringify({
        url : this.state.urlString.trim()
      }),*/
    })
      //.then(resp => resp.text())
      .then(resp => resp.json())
      .then((data) => {
        if (data.error) throw data.error.message || 'Unable to search';
        return data;
      })
      .then((data) => {
        console.log(data);
        this.setState((prevState) => ({
         jobIDs: prevState.jobIDs.concat(data),
         }));
        //this.state.jobIDs.push(data)
        
      })
      .catch((err) => {
        console.log(err);
      });
  };